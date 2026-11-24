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
      .from("rap_daily_prompts")
      .select("id")
      .eq("active_date", utcDateKey())
      .maybeSingle();
    if (promptError) throw promptError;
    if (!prompt) {
      return res.status(200).json({ attempts_used: 0, is_complete: false, code_score: 0, points_used: 0, submission: null });
    }

    const [stateResult, submissionResult, budgetResult] = await Promise.all([
      supabase.from("rap_player_day_state").select("attempts_used,is_complete,code_score").eq("prompt_id", prompt.id).eq("fid", fid).maybeSingle(),
      supabase.from("rap_submissions").select("id,submission_text,is_wildcard,score_code,score_community").eq("prompt_id", prompt.id).eq("fid", fid).maybeSingle(),
      supabase.from("rap_voting_budgets").select("points_used").eq("prompt_id", prompt.id).eq("voter_fid", fid).maybeSingle(),
    ]);
    if (stateResult.error) throw stateResult.error;
    if (submissionResult.error) throw submissionResult.error;
    if (budgetResult.error) throw budgetResult.error;

    return res.status(200).json({
      attempts_used: Number(stateResult.data?.attempts_used || 0),
      is_complete: Boolean(stateResult.data?.is_complete),
      code_score: Number(stateResult.data?.code_score || 0),
      points_used: Number(budgetResult.data?.points_used || 0),
      submission: submissionResult.data || null,
    });
  } catch (error) {
    console.error("GET /api/status failed:", error.message);
    return res.status(503).json({ code: "status_unavailable", message: "وضعیت امروز فعلاً در دسترس نیست." });
  }
}
