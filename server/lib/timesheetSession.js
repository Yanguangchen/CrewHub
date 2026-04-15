import { verifyWorkerSession, parseCookieHeader, COOKIE } from "./sessionCookie.js";

/**
 * @param {import("http").IncomingMessage} req
 */
export function getWorkerSession(req) {
  const raw = parseCookieHeader(req.headers.cookie || "", COOKIE);
  return verifyWorkerSession(raw);
}

/**
 * @param {Record<string, unknown>} data
 * @param {{ w: string }} session
 */
export function timesheetBelongsToWorker(data, session) {
  const w = String(data?.workerName || "").trim();
  return w === String(session.w || "").trim();
}
