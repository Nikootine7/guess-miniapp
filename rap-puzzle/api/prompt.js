import { getSupabaseAdmin, utcDateKey } from "../server/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("daily_prompts")
      .select("id, active_date, opening_line, target_rhyme_word")
      .eq("active_date", utcDateKey())
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ code: "no_prompt", message: "چالش امروز هنوز منتشر نشده." });
    return res.status(200).json({ prompt: data });
  } catch (error) {
    console.error("GET /api/prompt failed:", error.message);
    return res.status(503).json({ code: "prompt_unavailable", message: "چالش امروز فعلاً در دسترس نیست." });
  }
}
