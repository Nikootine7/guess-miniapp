import { requireFid } from "../server/auth.js";
import { getSupabaseAdmin, utcDateKey } from "../server/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  const fid = await requireFid(req, res);
  if (!fid) return;

  try {
    const supabase = getSupabaseAdmin();
    const { data: prompt, error: promptError } = await supabase
      .from("daily_prompts")
      .select("id")
      .eq("active_date", utcDateKey())
      .maybeSingle();
    if (promptError) throw promptError;
    if (!prompt) return res.status(404).json({ code: "no_prompt", message: "چالش امروز هنوز منتشر نشده." });

    const { data: state, error: stateError } = await supabase
      .from("player_day_state")
      .select("is_complete")
      .eq("prompt_id", prompt.id)
      .eq("fid", fid)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!state?.is_complete) {
      return res.status(403).json({ code: "feed_locked", message: "اول چالش امروزت رو کامل کن." });
    }

    const { data, error } = await supabase
      .from("user_submissions")
      .select("id, fid, submission_text, is_wildcard, score_code, score_community")
      .eq("prompt_id", prompt.id)
      .neq("fid", fid)
      .order("score_community", { ascending: true })
      .limit(30);
    if (error) throw error;

    return res.status(200).json({ submissions: data || [] });
  } catch (error) {
    console.error("GET /api/feed failed:", error.message);
    return res.status(503).json({ code: "feed_unavailable", message: "فید رأی‌گیری فعلاً در دسترس نیست." });
  }
}
