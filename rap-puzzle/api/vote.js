import { requireFid } from "../server/auth.js";
import { getSupabaseAdmin } from "../server/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  const fid = await requireFid(req, res);
  if (!fid) return;

  const submissionId = typeof req.body?.submission_id === "string" ? req.body.submission_id : "";
  const points = Number(req.body?.points);
  if (!submissionId || !Number.isInteger(points) || points < 1 || points > 100) {
    return res.status(400).json({ code: "invalid_vote", message: "رأی معتبر نیست." });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("rap_allocate_social_points", {
      p_fid: fid,
      p_submission_id: submissionId,
      p_points: points,
    });

    if (error) {
      const text = String(error.message || "");
      if (text.includes("vote_budget_exceeded")) {
        return res.status(409).json({ code: "vote_budget_exceeded", message: "امتیاز اجتماعی آزاد کافی نیست." });
      }
      if (text.includes("self_vote")) {
        return res.status(403).json({ code: "self_vote", message: "به نسخهٔ خودت رأی داده نمی‌شه." });
      }
      if (text.includes("feed_locked")) {
        return res.status(403).json({ code: "feed_locked", message: "اول چالش امروزت رو کامل کن." });
      }
      if (text.includes("invalid_submission")) {
        return res.status(404).json({ code: "invalid_submission", message: "این نسخه برای رأی‌گیری پیدا نشد." });
      }
      console.error("rap_allocate_social_points failed:", text);
      return res.status(503).json({ code: "vote_failed", message: "رأی ثبت نشد؛ کمی بعد دوباره امتحان کن." });
    }

    return res.status(200).json({ points_used: data, points_remaining: 100 - Number(data) });
  } catch (error) {
    console.error("POST /api/vote failed:", error.message);
    return res.status(503).json({ code: "vote_unavailable", message: "ثبت رأی فعلاً در دسترس نیست." });
  }
}
