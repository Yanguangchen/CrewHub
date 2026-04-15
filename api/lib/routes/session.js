/**
 * GET /api/session — returns worker identity if the HttpOnly session cookie is valid.
 */
import { verifyWorkerSession, parseCookieHeader, COOKIE } from "../sessionCookie.js";

export async function handle(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const raw = parseCookieHeader(req.headers.cookie || "", COOKIE);
  const session = verifyWorkerSession(raw);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  return res.status(200).json({
    ok: true,
    workerName: session.w,
    employeeId: session.e,
  });
}
