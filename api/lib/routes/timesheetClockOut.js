/**
 * POST /api/timesheet-clock-out  Body: { timesheetId }
 */
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "../firebaseAdmin.js";
import { getWorkerSession, timesheetBelongsToWorker } from "../timesheetSession.js";
import { parseJsonBody } from "../parseJsonBody.js";

const COL = "timesheets";

function isStrictlyAfterSevenPM(date) {
  const d = new Date(date);
  const cutoff = new Date(d);
  cutoff.setHours(19, 0, 0, 0);
  return d.getTime() > cutoff.getTime();
}

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
  const whenRaw = body.clockOutAt != null ? String(body.clockOutAt) : "";
  const when = whenRaw ? new Date(whenRaw) : new Date();
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ error: "Invalid clockOutAt" });
  }
  if (!timesheetId) {
    return res.status(400).json({ error: "timesheetId required" });
  }

  try {
    const ref = getDb().collection(COL).doc(timesheetId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Timesheet not found" });
    }
    const data = snap.data() || {};
    if (!timesheetBelongsToWorker(data, session)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const eligible = isStrictlyAfterSevenPM(when);
    const payload = {
      clockOutTime: Timestamp.fromDate(when),
    };
    if (!eligible) {
      payload.claimedMeal = false;
    }

    await ref.update(payload);

    return res.status(200).json({ ok: true, eligibleForMeal: eligible });
  } catch (e) {
    console.error("timesheet-clock-out", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
