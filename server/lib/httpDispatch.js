/**
 * Single entry for all CrewHub API routes (Hobby plan: one Serverless Function).
 * Dynamic file: api/[...slug].js forwards here; slug is the first path segment after /api/.
 */
import { handle as handleSession } from "./routes/session.js";
import { handle as handleLogout } from "./routes/logout.js";
import { handle as handleAdminVerify } from "./routes/adminVerify.js";
import { handle as handleTimesheetOpen } from "./routes/timesheetOpen.js";
import { handle as handleTimesheetClockOut } from "./routes/timesheetClockOut.js";
import { handle as handleTimesheetMeal } from "./routes/timesheetMeal.js";
import { handle as handleTimesheetDeleteOpen } from "./routes/timesheetDeleteOpen.js";
import { handle as handleTimesheetAdminDelete } from "./routes/timesheetAdminDelete.js";
import { handle as handleLogin } from "./routes/login.js";
import { handle as handleRosterUpsert } from "./routes/rosterUpsert.js";
import { handle as handleDriverClaim } from "./routes/driverClaim.js";
import { handle as handleClockIn } from "./routes/clockIn.js";

/** @type {Record<string, (req: import("http").IncomingMessage, res: import("http").ServerResponse) => unknown>} */
const HANDLERS = {
  session: handleSession,
  logout: handleLogout,
  "admin-verify": handleAdminVerify,
  "timesheet-open": handleTimesheetOpen,
  "timesheet-clock-out": handleTimesheetClockOut,
  "timesheet-meal": handleTimesheetMeal,
  "timesheet-delete-open": handleTimesheetDeleteOpen,
  "timesheet-admin-delete": handleTimesheetAdminDelete,
  login: handleLogin,
  "roster-upsert": handleRosterUpsert,
  "driver-claim": handleDriverClaim,
  "clock-in": handleClockIn,
};

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
export default async function dispatch(req, res) {
  const slug = firstSlug(req);
  if (!slug) {
    return res.status(404).json({ error: "Not found" });
  }
  const fn = HANDLERS[slug];
  if (!fn) {
    return res.status(404).json({ error: "Not found" });
  }
  return fn(req, res);
}

/** @param {import("http").IncomingMessage} req */
function firstSlug(req) {
  const q = /** @type {Record<string, string | string[] | undefined>} */ (req.query || {});
  const s = q.slug;
  if (Array.isArray(s)) return String(s[0] || "").trim();
  if (typeof s === "string") return s.split("/")[0].trim();
  try {
    const host = req.headers?.host || "localhost";
    const pathname = new URL(req.url || "/", `http://${host}`).pathname || "";
    const m = pathname.match(/^\/api\/([^/?]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}
