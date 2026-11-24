import { requireFid } from "../server/auth.js";
import { getSupabaseAdmin } from "../server/supabase.js";
import { lastWordOf } from "../shared/normalize-persian.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  const fid = await requireFid(req, res);
  if (!fid) return;

  const verse = typeof req.body?.verse === "string" ? req.body.verse.trim() : "";
  if (!verse || [...verse].length > 280) {
    return res.status(400).json({ code: "invalid_verse", message: "مصرع باید بین ۱ تا ۲۸۰ نویسه باشد." });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("rap_submit_attempt", {
      p_fid: fid,
      p_verse: verse,
      p_end_word: lastWordOf(verse),
    });

    if (error) {
      const text = String(error.message || "");
      if (text.includes("no_active_prompt")) {
        return res.status(404).json({ code: "no_prompt", message: "چالش امروز هنوز منتشر نشده." });
      }
      if (text.includes("attempts_locked")) {
        return res.status(409).json({ code: "attempts_locked", message: "سه تلاش امروزت تمام شده." });
      }
      if (text.includes("invalid_verse")) {
        return res.status(400).json({ code: "invalid_verse", message: "مصرع قابل قبول نیست." });
      }
      console.error("rap_submit_attempt failed:", text);
      return res.status(503).json({ code: "submit_failed", message: "تلاش ثبت نشد؛ کمی بعد دوباره امتحان کن." });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("POST /api/submit failed:", error.message);
    return res.status(503).json({ code: "submit_unavailable", message: "ثبت تلاش فعلاً در دسترس نیست." });
  }
}
