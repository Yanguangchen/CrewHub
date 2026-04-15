/**
 * POST /api/timesheet-meal  Body: { timesheetId, claimedMeal }
 */
import { getDb } from "./lib/firebaseAdmin.js";
import { getWorkerSession, timesheetBelongsToWorker } from "./lib/timesheetSession.js";
import { parseJsonBody } from "./lib/parseJsonBody.js";

const COL = "timesheets";

export default async function handler(req, res) {
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
  const claimedMeal = !!body.claimedMeal;

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

    await ref.update({ claimedMeal });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("timesheet-meal", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
