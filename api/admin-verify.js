/**
 * GET /api/admin-verify
 * Authorization: Bearer <Firebase ID token>
 * Confirms Google sign-in + primary owner UID (always) or ADMIN_UIDS. Optional; admin UI does not call this.
 */
import { requireAdminFromRequest } from "./lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { email } = await requireAdminFromRequest(req);
    return res.status(200).json({ ok: true, email });
  } catch (e) {
    const status = /** @type {any} */ (e).status || 500;
    if (status >= 500) console.error("admin-verify", e);
    return res.status(status).json({ error: e.message || "Error" });
  }
}
