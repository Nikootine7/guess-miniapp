import { createClient } from "@farcaster/quick-auth";

const quickAuth = createClient();

export async function requireFid(req, res) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({ code: "missing_auth", message: "برای ادامه وارد Farcaster شو." });
    return null;
  }

  const domain = process.env.FARCASTER_APP_DOMAIN;
  if (!domain) {
    console.error("FARCASTER_APP_DOMAIN is not configured.");
    res.status(500).json({ code: "server_config", message: "تنظیمات احراز هویت کامل نیست." });
    return null;
  }

  try {
    const payload = await quickAuth.verifyJwt({ token: match[1], domain });
    const fid = Number(payload.sub);
    if (!Number.isSafeInteger(fid) || fid <= 0) {
      res.status(401).json({ code: "invalid_fid", message: "هویت Farcaster معتبر نیست." });
      return null;
    }
    return fid;
  } catch {
    res.status(401).json({ code: "invalid_auth", message: "نشست Farcaster معتبر نیست؛ دوباره وارد شو." });
    return null;
  }
}

function getConfiguredAdminFids() {
  return (process.env.RAPPUZZLE_ADMIN_FIDS || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

export function isAdminFid(fid) {
  return getConfiguredAdminFids().includes(fid);
}

export async function requireAdminFid(req, res) {
  const fid = await requireFid(req, res);
  if (!fid) return null;

  const configuredFids = getConfiguredAdminFids();
  if (configuredFids.length === 0) {
    res.status(503).json({ code: "admin_not_configured", message: "مدیریت چالش‌ها هنوز تنظیم نشده." });
    return null;
  }

  if (!configuredFids.includes(fid)) {
    res.status(403).json({ code: "admin_required", message: "دسترسی مدیریت این بخش را نداری." });
    return null;
  }

  return fid;
}
