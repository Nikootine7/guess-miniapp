import { isAdminFid, requireFid } from "../../server/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "method_not_allowed" });
  }

  const fid = await requireFid(req, res);
  if (!fid) return;
  return res.status(200).json({ fid, is_admin: isAdminFid(fid) });
}
