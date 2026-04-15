/**
 * POST /api/roster-upsert
 */
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../firebaseAdmin.js";
import { requireAdminFromRequest } from "../adminAuth.js";
import { hashPin } from "../pinHash.js";

const COL = "worker_credentials";

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

function normEmployeeId(id) {
  return String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 128);
}

export async function handle(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const status = /** @type {any} */ (e).status || 500;
    if (status >= 500) console.error("roster-upsert auth", e);
    return res.status(status).json({ error: e.message || "Unauthorized" });
  }

  const body = parseBody(req);
  const employeeIdRaw = String(body.employeeId || "").trim();
  const workerName = String(body.workerName || "").trim();
  const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 6);

  if (!employeeIdRaw || !workerName || pin.length !== 6) {
    return res.status(400).json({ error: "employeeId, workerName, and 6-digit pin required" });
  }

  const key = normEmployeeId(employeeIdRaw);
  if (!key) {
    return res.status(400).json({ error: "Invalid employeeId" });
  }

  try {
    const pinHash = await hashPin(pin);
    await getDb()
      .collection(COL)
      .doc(key)
      .set(
        {
          pinHash,
          workerName,
          employeeId: employeeIdRaw,
          pin: FieldValue.delete(),
        },
        { merge: true }
      );
    return res.status(200).json({ ok: true, id: key });
  } catch (e) {
    console.error("roster-upsert", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
