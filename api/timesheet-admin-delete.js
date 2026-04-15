/**
 * POST /api/timesheet-admin-delete  Body: { timesheetId }
 * Authorization: Bearer Google ID token. Primary / ADMIN_UIDS only.
 */
import { getDb } from "./lib/firebaseAdmin.js";
import { requireAdminFromRequest } from "./lib/adminAuth.js";
import { parseJsonBody } from "./lib/parseJsonBody.js";

const COL = "timesheets";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const status = /** @type {any} */ (e).status || 500;
    if (status >= 500) console.error("timesheet-admin-delete auth", e);
    return res.status(status).json({ error: e.message || "Unauthorized" });
  }

  const body = parseJsonBody(req);
  const timesheetId = String(body.timesheetId || "").trim();
  if (!timesheetId) {
    return res.status(400).json({ error: "timesheetId required" });
  }

  try {
    await getDb().collection(COL).doc(timesheetId).delete();
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("timesheet-admin-delete", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
