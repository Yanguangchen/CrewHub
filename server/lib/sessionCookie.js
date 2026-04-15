import "./loadEnv.js";
import crypto from "crypto";

const COOKIE = "crewhub_worker";
const MAX_AGE_SEC = 60 * 60 * 12;

export { COOKIE, MAX_AGE_SEC };

/**
 * @param {{ employeeId: string, workerName: string }} p
 */
export function signWorkerSession({ employeeId, workerName }) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars)");
  }
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = { e: employeeId, w: workerName, exp };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** @returns {{ e: string, w: string, exp: number, s?: string } | null} */
export function verifyWorkerSession(token) {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.e || !payload?.w || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

/**
 * @param {import('http').ServerResponse} res
 * @param {string} value
 * @param {{ secure: boolean }} opts
 */
export function setWorkerCookie(res, value, { secure }) {
  const flags = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${MAX_AGE_SEC}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) flags.push("Secure");
  res.setHeader("Set-Cookie", flags.join("; "));
}
