import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient as createSupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { createClient as createQuickAuthClient } from "npm:@farcaster/quick-auth@0.0.8";

const APP_DOMAIN = "rappuzzle.faithfulfolio64.chatgpt.site";
const quickAuth = createQuickAuthClient();
let supabaseClient;

function json(request, value, status = 200, extraHeaders = {}) {
  const requestOrigin = request.headers.get("origin");
  const allowOrigin = !requestOrigin || requestOrigin === "https://" + APP_DOMAIN
    ? "https://" + APP_DOMAIN
    : "https://" + APP_DOMAIN;
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      ...extraHeaders,
    },
  });
}

function emptyOptionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://" + APP_DOMAIN,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    },
  });
}

function getSupabaseAdmin() {
  if (supabaseClient) return supabaseClient;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  supabaseClient = createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizePersianToken(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
    .replace(/[\u064A\u0649]/gu, "ی")
    .replace(/\u0643/gu, "ک")
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("fa");
}

function lastWordOf(value) {
  const words = String(value ?? "").normalize("NFKC").trim().split(/\s+/u);
  return normalizePersianToken(words.at(-1) || "");
}

function configuredAdminFids() {
  return (Deno.env.get("RAPPUZZLE_ADMIN_FIDS") || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

function isAdminFid(fid) {
  return configuredAdminFids().includes(fid);
}

async function requireFid(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { response: json(request, { code: "missing_auth", message: "برای ادامه وارد Farcaster شو." }, 401) };
  }
  try {
    const payload = await quickAuth.verifyJwt({ token: match[1], domain: APP_DOMAIN });
    const fid = Number(payload.sub);
    if (!Number.isSafeInteger(fid) || fid <= 0) {
      return { response: json(request, { code: "invalid_fid", message: "هویت Farcaster معتبر نیست." }, 401) };
    }
    return { fid };
  } catch {
    return { response: json(request, { code: "invalid_auth", message: "نشست Farcaster معتبر نیست؛ دوباره وارد شو." }, 401) };
  }
}

async function readBody(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function methodNotAllowed(request, method) {
  return json(request, { code: "method_not_allowed" }, 405, { Allow: method });
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

async function routeRequest(request) {
  const url = new URL(request.url);
  const functionMarker = "/rappuzzle-api";
  const markerIndex = url.pathname.indexOf(functionMarker);
  const route = markerIndex >= 0
    ? url.pathname.slice(markerIndex + functionMarker.length) || "/"
    : url.pathname;

  if (request.method === "OPTIONS") return emptyOptionsResponse(request);

  if (route === "/prompt") {
    if (request.method !== "GET") return methodNotAllowed(request, "GET");
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("rap_daily_prompts")
        .select("id, active_date, opening_line, target_rhyme_word, accepted_end_words")
        .eq("active_date", utcDateKey())
        .maybeSingle();
      if (error) throw error;
      if (!data) return json(request, { code: "no_prompt", message: "چالش امروز هنوز منتشر نشده." }, 404);
      return json(request, { prompt: data });
    } catch (error) {
      console.error("GET /prompt failed:", error?.message || "unknown error");
      return json(request, { code: "prompt_unavailable", message: "چالش امروز فعلاً در دسترس نیست." }, 503);
    }
  }

  if (route === "/auth/me") {
    if (request.method !== "GET") return methodNotAllowed(request, "GET");
    const auth = await requireFid(request);
    if (!auth.fid) return auth.response;
    return json(request, { fid: auth.fid, is_admin: isAdminFid(auth.fid) });
  }

  if (route === "/status") {
    if (request.method !== "GET") return methodNotAllowed(request, "GET");
    const auth = await requireFid(request);
    if (!auth.fid) return auth.response;
    try {
      const client = getSupabaseAdmin();
      const { data: prompt, error: promptError } = await client
        .from("rap_daily_prompts")
        .select("id")
        .eq("active_date", utcDateKey())
        .maybeSingle();
      if (promptError) throw promptError;
      if (!prompt) {
        return json(request, {
          prompt_available: false,
          attempts_used: 0,
          is_complete: false,
          code_score: 0,
          points_used: 0,
          submission: null,
        });
      }
      const [stateResult, submissionResult, budgetResult] = await Promise.all([
        client.from("rap_player_day_state").select("attempts_used,is_complete,code_score").eq("prompt_id", prompt.id).eq("fid", auth.fid).maybeSingle(),
        client.from("rap_submissions").select("id,submission_text,is_wildcard,score_code,score_community").eq("prompt_id", prompt.id).eq("fid", auth.fid).maybeSingle(),
        client.from("rap_voting_budgets").select("points_used").eq("prompt_id", prompt.id).eq("voter_fid", auth.fid).maybeSingle(),
      ]);
      if (stateResult.error) throw stateResult.error;
      if (submissionResult.error) throw submissionResult.error;
      if (budgetResult.error) throw budgetResult.error;
      return json(request, {
        prompt_available: true,
        attempts_used: Number(stateResult.data?.attempts_used || 0),
        is_complete: Boolean(stateResult.data?.is_complete),
        code_score: Number(stateResult.data?.code_score || 0),
        points_used: Number(budgetResult.data?.points_used || 0),
        submission: submissionResult.data || null,
      });
    } catch (error) {
      console.error("GET /status failed:", error?.message || "unknown error");
      return json(request, { code: "status_unavailable", message: "وضعیت امروز فعلاً در دسترس نیست." }, 503);
    }
  }

  if (route === "/feed") {
    if (request.method !== "GET") return methodNotAllowed(request, "GET");
    const auth = await requireFid(request);
    if (!auth.fid) return auth.response;
    try {
      const client = getSupabaseAdmin();
      const { data: prompt, error: promptError } = await client
        .from("rap_daily_prompts")
        .select("id")
        .eq("active_date", utcDateKey())
        .maybeSingle();
      if (promptError) throw promptError;
      if (!prompt) return json(request, { code: "no_prompt", message: "چالش امروز هنوز منتشر نشده." }, 404);
      const { data: state, error: stateError } = await client
        .from("rap_player_day_state")
        .select("is_complete")
        .eq("prompt_id", prompt.id)
        .eq("fid", auth.fid)
        .maybeSingle();
      if (stateError) throw stateError;
      if (!state?.is_complete) return json(request, { code: "feed_locked", message: "اول چالش امروزت رو کامل کن." }, 403);
      const { data, error } = await client
        .from("rap_submissions")
        .select("id, fid, submission_text, is_wildcard, score_code, score_community")
        .eq("prompt_id", prompt.id)
        .neq("fid", auth.fid)
        .order("score_community", { ascending: true })
        .limit(30);
      if (error) throw error;
      return json(request, { submissions: data || [] });
    } catch (error) {
      console.error("GET /feed failed:", error?.message || "unknown error");
      return json(request, { code: "feed_unavailable", message: "فید رأی‌گیری فعلاً در دسترس نیست." }, 503);
    }
  }

  if (route === "/submit") {
    if (request.method !== "POST") return methodNotAllowed(request, "POST");
    const auth = await requireFid(request);
    if (!auth.fid) return auth.response;
    const body = await readBody(request);
    const verse = typeof body.verse === "string" ? body.verse.trim() : "";
    if (!verse || [...verse].length > 280) {
      return json(request, { code: "invalid_verse", message: "مصرع باید بین ۱ تا ۲۸۰ نویسه باشد." }, 400);
    }
    try {
      const { data, error } = await getSupabaseAdmin().rpc("rap_submit_attempt", {
        p_fid: auth.fid,
        p_verse: verse,
        p_end_word: lastWordOf(verse),
      });
      if (error) {
        const message = String(error.message || "");
        if (message.includes("no_active_prompt")) return json(request, { code: "no_prompt", message: "چالش امروز هنوز منتشر نشده." }, 404);
        if (message.includes("attempts_locked")) return json(request, { code: "attempts_locked", message: "سه تلاش امروزت تمام شده." }, 409);
        if (message.includes("invalid_verse")) return json(request, { code: "invalid_verse", message: "مصرع قابل قبول نیست." }, 400);
        console.error("rap_submit_attempt failed:", message);
        return json(request, { code: "submit_failed", message: "تلاش ثبت نشد؛ کمی بعد دوباره امتحان کن." }, 503);
      }
      return json(request, data);
    } catch (error) {
      console.error("POST /submit failed:", error?.message || "unknown error");
      return json(request, { code: "submit_unavailable", message: "ثبت تلاش فعلاً در دسترس نیست." }, 503);
    }
  }

  if (route === "/vote") {
    if (request.method !== "POST") return methodNotAllowed(request, "POST");
    const auth = await requireFid(request);
    if (!auth.fid) return auth.response;
    const body = await readBody(request);
    const submissionId = typeof body.submission_id === "string" ? body.submission_id : "";
    const points = Number(body.points);
    if (!submissionId || points !== 10) return json(request, { code: "invalid_vote", message: "رأی معتبر نیست." }, 400);
    try {
      const { data, error } = await getSupabaseAdmin().rpc("rap_allocate_social_points", {
        p_fid: auth.fid,
        p_submission_id: submissionId,
        p_points: points,
      });
      if (error) {
        const message = String(error.message || "");
        if (message.includes("invalid_vote")) return json(request, { code: "invalid_vote", message: "هر رأی باید دقیقاً ۱۰ امتیاز باشد." }, 400);
        if (message.includes("vote_budget_exceeded")) return json(request, { code: "vote_budget_exceeded", message: "امتیاز اجتماعی آزاد کافی نیست." }, 409);
        if (message.includes("self_vote")) return json(request, { code: "self_vote", message: "به نسخهٔ خودت رأی داده نمی‌شه." }, 403);
        if (message.includes("feed_locked")) return json(request, { code: "feed_locked", message: "اول چالش امروزت رو کامل کن." }, 403);
        if (message.includes("invalid_submission")) return json(request, { code: "invalid_submission", message: "این نسخه برای رأی‌گیری پیدا نشد." }, 404);
        console.error("rap_allocate_social_points failed:", message);
        return json(request, { code: "vote_failed", message: "رأی ثبت نشد؛ کمی بعد دوباره امتحان کن." }, 503);
      }
      return json(request, { points_used: data, points_remaining: 100 - Number(data) });
    } catch (error) {
      console.error("POST /vote failed:", error?.message || "unknown error");
      return json(request, { code: "vote_unavailable", message: "ثبت رأی فعلاً در دسترس نیست." }, 503);
    }
  }

  if (route === "/leaderboard") {
    if (request.method !== "GET") return methodNotAllowed(request, "GET");
    try {
      const client = getSupabaseAdmin();
      const [leaderboardResult, awardsResult] = await Promise.all([
        client.rpc("rap_weekly_leaderboard"),
        client.rpc("rap_weekly_awards"),
      ]);
      if (leaderboardResult.error) throw leaderboardResult.error;
      if (awardsResult.error) throw awardsResult.error;
      return json(request, {
        leaderboard: leaderboardResult.data || [],
        awards: awardsResult.data || [],
      });
    } catch (error) {
      console.error("GET /leaderboard failed:", error?.message || "unknown error");
      return json(request, { code: "leaderboard_unavailable", message: "جدول هفتگی فعلاً در دسترس نیست." }, 503);
    }
  }

  if (route === "/admin/prompts") {
    if (request.method !== "POST") return methodNotAllowed(request, "POST");
    const auth = await requireFid(request);
    if (!auth.fid) return auth.response;
    if (configuredAdminFids().length === 0) {
      return json(request, { code: "admin_not_configured", message: "مدیریت چالش‌ها هنوز تنظیم نشده." }, 503);
    }
    if (!isAdminFid(auth.fid)) return json(request, { code: "admin_required", message: "دسترسی مدیریت این بخش را نداری." }, 403);
    const body = await readBody(request);
    const activeDate = body.active_date;
    const openingLine = typeof body.opening_line === "string" ? body.opening_line.trim() : "";
    const targetRhymeWord = normalizePersianToken(body.target_rhyme_word);
    const rawWords = body.accepted_end_words;
    if (!isIsoDate(activeDate) || activeDate < utcDateKey()) {
      return json(request, { code: "invalid_active_date", message: "تاریخ باید امروز یا یک روز آینده باشد." }, 400);
    }
    if (!openingLine || [...openingLine].length > 500) {
      return json(request, { code: "invalid_opening_line", message: "خط شروع باید بین ۱ تا ۵۰۰ نویسه باشد." }, 400);
    }
    if (!targetRhymeWord || /\s/u.test(targetRhymeWord) || [...targetRhymeWord].length > 100) {
      return json(request, { code: "invalid_target_word", message: "کلمهٔ قافیهٔ هدف معتبر نیست." }, 400);
    }
    if (!Array.isArray(rawWords) || rawWords.length < 1 || rawWords.length > 50 || rawWords.some((word) => typeof word !== "string")) {
      return json(request, { code: "invalid_accepted_words", message: "فهرست قافیه‌ها باید ۱ تا ۵۰ واژه داشته باشد." }, 400);
    }
    const acceptedEndWords = [...new Set([targetRhymeWord, ...rawWords.map(normalizePersianToken)])];
    if (acceptedEndWords.length > 50 || acceptedEndWords.some((word) => !word || /\s/u.test(word) || [...word].length > 100)) {
      return json(request, { code: "invalid_accepted_words", message: "یکی از واژه‌های قافیه خالی یا بیش از حد بلند است." }, 400);
    }
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("rap_daily_prompts")
        .upsert({
          active_date: activeDate,
          opening_line: openingLine,
          target_rhyme_word: targetRhymeWord,
          accepted_end_words: acceptedEndWords,
        }, { onConflict: "active_date" })
        .select("id,active_date,opening_line,target_rhyme_word")
        .single();
      if (error?.message?.includes("prompt_locked")) {
        return json(request, { code: "prompt_locked", message: "بعد از اولین تلاش، چالش همان روز قابل تغییر نیست." }, 409);
      }
      if (error) throw error;
      return json(request, { prompt: data, accepted_end_words: acceptedEndWords });
    } catch (error) {
      console.error("POST /admin/prompts failed:", error?.message || "unknown error");
      return json(request, { code: "prompt_save_failed", message: "ذخیرهٔ چالش انجام نشد." }, 503);
    }
  }

  return json(request, { code: "not_found", message: "این مسیر پیدا نشد." }, 404);
}

Deno.serve((request) => routeRequest(request).catch((error) => {
  console.error("Unhandled API error:", error?.message || "unknown error");
  return json(request, { code: "server_error", message: "سرویس موقتاً در دسترس نیست." }, 500);
}));
