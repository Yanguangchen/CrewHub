/**
 * POST /api/logout — clears the worker HttpOnly session cookie.
 */
import { COOKIE } from "../sessionCookie.js";

export async function handle(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = proto === "https";
  const flags = [`${COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) flags.push("Secure");
  res.setHeader("Set-Cookie", flags.join("; "));
  return res.status(200).json({ ok: true });
}
