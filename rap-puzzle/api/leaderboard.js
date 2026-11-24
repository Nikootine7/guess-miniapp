import { getSupabaseAdmin } from "../server/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [leaderboardResult, awardsResult] = await Promise.all([
      supabase.rpc("rap_weekly_leaderboard"),
      supabase.rpc("rap_weekly_awards"),
    ]);
    if (leaderboardResult.error) throw leaderboardResult.error;
    if (awardsResult.error) throw awardsResult.error;
    return res.status(200).json({
      leaderboard: leaderboardResult.data || [],
      awards: awardsResult.data || [],
    });
  } catch (error) {
    console.error("GET /api/leaderboard failed:", error.message);
    return res.status(503).json({ code: "leaderboard_unavailable", message: "جدول هفتگی فعلاً در دسترس نیست." });
  }
}
