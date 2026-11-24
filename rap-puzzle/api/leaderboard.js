import { getSupabaseAdmin } from "../server/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("rap_weekly_leaderboard");
    if (error) throw error;
    return res.status(200).json({ leaderboard: data || [] });
  } catch (error) {
    console.error("GET /api/leaderboard failed:", error.message);
    return res.status(503).json({ code: "leaderboard_unavailable", message: "جدول هفتگی فعلاً در دسترس نیست." });
  }
}
