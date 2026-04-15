/**
 * Best-effort in-memory rate limit for login failures (per IP + employee doc key).
 * Resets on cold start; use WAF / Vercel firewall for stronger protection in production.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 12;

/** @type {Map<string, { count: number; firstAt: number; lockedUntil?: number }>} */
const fails = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of fails) {
    if (v.lockedUntil && now >= v.lockedUntil) {
      fails.delete(k);
      continue;
    }
    if (!v.lockedUntil && now - v.firstAt > WINDOW_MS) fails.delete(k);
  }
}

/**
 * @param {string} key e.g. `${ip}:${employeeDocKey}`
 * @returns {{ blocked: boolean, retryAfterSec?: number }}
 */
export function isLoginBlocked(key) {
  prune();
  const now = Date.now();
  const e = fails.get(key);
  if (!e) return { blocked: false };
  if (e.lockedUntil && now < e.lockedUntil) {
    return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((e.lockedUntil - now) / 1000)) };
  }
  if (now - e.firstAt > WINDOW_MS) {
    fails.delete(key);
    return { blocked: false };
  }
  return { blocked: false };
}

/** Call after a failed PIN / unknown user (same response to caller). */
export function registerLoginFailure(key) {
  const now = Date.now();
  let e = fails.get(key);
  if (!e || now - e.firstAt > WINDOW_MS) {
    e = { count: 0, firstAt: now };
  }
  e.count += 1;
  if (e.count >= MAX_FAILS) {
    e.lockedUntil = now + WINDOW_MS;
  }
  fails.set(key, e);
}

export function clearLoginFailures(key) {
  fails.delete(key);
}

/** @param {import('http').IncomingMessage} req */
export function clientIp(req) {
  const x = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (x) return x.slice(0, 128);
  const ra = req.socket?.remoteAddress;
  return ra ? String(ra).slice(0, 128) : "unknown";
}
