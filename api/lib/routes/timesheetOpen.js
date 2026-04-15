/**
 * GET /api/timesheet-open?siteName=&date=YYYY-MM-DD
 */
import { getDb } from "../firebaseAdmin.js";
import { getWorkerSession } from "../timesheetSession.js";

const COL = "timesheets";

export async function handle(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getWorkerSession(req);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const workerName = String(session.w || "").trim();
  if (!workerName) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const siteName = String(url.searchParams.get("siteName") || "").trim();
  const dateKey = String(url.searchParams.get("date") || "").trim();

  if (!siteName || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return res.status(400).json({ error: "siteName and date (YYYY-MM-DD) required" });
  }

  try {
    const qs = await getDb().collection(COL).where("date", "==", dateKey).where("workerName", "==", workerName).limit(20).get();

    const match = qs.docs.find((d) => {
      const x = d.data();
      return String(x.siteName || "").trim() === siteName && x.clockOutTime == null;
    });

    if (!match) {
      return res.status(200).json({ open: false });
    }

    return res.status(200).json({
      open: true,
      timesheetId: match.id,
      data: match.data(),
    });
  } catch (e) {
    console.error("timesheet-open", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
