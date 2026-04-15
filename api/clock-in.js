/**
 * POST /api/clock-in
 * Body: { siteName, date? }
 * Requires HttpOnly `crewhub_worker` cookie. Worker name comes from the session (set at login).
 * No GPS / location fields.
 */
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firebaseAdmin.js";
import { verifyWorkerSession, parseCookieHeader, COOKIE } from "./lib/sessionCookie.js";

const COL_TIMESHEETS = "timesheets";

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function todayDateString() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawCookie = parseCookieHeader(req.headers.cookie || "", COOKIE);
  const session = verifyWorkerSession(rawCookie);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated; login first" });
  }

  const body = parseBody(req);
  const siteName = String(body.siteName || "").trim();
  const workerName = String(session.w || "").trim();

  if (!siteName) {
    return res.status(400).json({ error: "siteName required" });
  }
  if (!workerName) {
    return res.status(401).json({ error: "Invalid session" });
  }

  let dateStr = String(body.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = todayDateString();
  }

  try {
    const clockInTime = Timestamp.now();

    const docRef = await getDb().collection(COL_TIMESHEETS).add({
      workerName,
      siteName,
      employeeId: session.e,
      clockInTime,
      clockOutTime: null,
      claimedMeal: false,
      date: dateStr,
    });

    return res.status(200).json({ ok: true, timesheetId: docRef.id });
  } catch (e) {
    console.error("clock-in", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
