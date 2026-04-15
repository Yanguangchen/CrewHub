/**
 * POST /api/timesheet-delete-open  Body: { timesheetId }
 */
import { getDb } from "../firebaseAdmin.js";
import { getWorkerSession, timesheetBelongsToWorker } from "../timesheetSession.js";
import { parseJsonBody } from "../parseJsonBody.js";

const COL = "timesheets";

export async function handle(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getWorkerSession(req);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const body = parseJsonBody(req);
  const timesheetId = String(body.timesheetId || "").trim();
  if (!timesheetId) {
    return res.status(400).json({ error: "timesheetId required" });
  }

  try {
    const ref = getDb().collection(COL).doc(timesheetId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Shift not found" });
    }
    const data = snap.data() || {};
    if (!timesheetBelongsToWorker(data, session)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (data.clockOutTime != null) {
      return res.status(400).json({ error: "This shift is already closed" });
    }

    await ref.delete();
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("timesheet-delete-open", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
