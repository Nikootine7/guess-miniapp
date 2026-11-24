import { requireAdminFid } from "../../server/auth.js";
import { getSupabaseAdmin, utcDateKey } from "../../server/supabase.js";
import { normalizePersianToken } from "../../shared/normalize-persian.js";

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  const fid = await requireAdminFid(req, res);
  if (!fid) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const activeDate = body.active_date;
  const openingLine = typeof body.opening_line === "string" ? body.opening_line.trim() : "";
  const targetRhymeWord = normalizePersianToken(body.target_rhyme_word);
  const rawWords = body.accepted_end_words;

  if (!isIsoDate(activeDate) || activeDate < utcDateKey()) {
    return res.status(400).json({ code: "invalid_active_date", message: "تاریخ باید امروز یا یک روز آینده باشد." });
  }
  if (!openingLine || [...openingLine].length > 500) {
    return res.status(400).json({ code: "invalid_opening_line", message: "خط شروع باید بین ۱ تا ۵۰۰ نویسه باشد." });
  }
  if (!targetRhymeWord || /\s/u.test(targetRhymeWord) || [...targetRhymeWord].length > 100) {
    return res.status(400).json({ code: "invalid_target_word", message: "کلمهٔ قافیهٔ هدف معتبر نیست." });
  }
  if (!Array.isArray(rawWords) || rawWords.length < 1 || rawWords.length > 50 || rawWords.some((word) => typeof word !== "string")) {
    return res.status(400).json({ code: "invalid_accepted_words", message: "فهرست قافیه‌ها باید ۱ تا ۵۰ واژه داشته باشد." });
  }

  const acceptedEndWords = [...new Set([targetRhymeWord, ...rawWords.map(normalizePersianToken)])];
  if (acceptedEndWords.length > 50 || acceptedEndWords.some((word) => !word || /\s/u.test(word) || [...word].length > 100)) {
    return res.status(400).json({ code: "invalid_accepted_words", message: "یکی از واژه‌های قافیه خالی یا بیش از حد بلند است." });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
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
      return res.status(409).json({ code: "prompt_locked", message: "بعد از اولین تلاش، چالش همان روز قابل تغییر نیست." });
    }
    if (error) throw error;
    return res.status(200).json({ prompt: data, accepted_end_words: acceptedEndWords });
  } catch (error) {
    console.error("POST /api/admin/prompts failed:", error.message);
    return res.status(503).json({ code: "prompt_save_failed", message: "ذخیرهٔ چالش انجام نشد." });
  }
}
