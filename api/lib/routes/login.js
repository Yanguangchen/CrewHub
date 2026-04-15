/**
 * POST /api/login
 */
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "../firebaseAdmin.js";
import { signWorkerSession, setWorkerCookie } from "../sessionCookie.js";
import { verifyPin, hashPin } from "../pinHash.js";
import { clientIp, isLoginBlocked, registerLoginFailure, clearLoginFailures } from "../loginRateLimit.js";

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

  const body = parseBody(req);
  const employeeIdRaw = String(body.employeeId || "").trim();
  const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 6);

  if (!employeeIdRaw || pin.length !== 6) {
    return res.status(400).json({ error: "employeeId and 6-digit pin required" });
  }

  const key = normEmployeeId(employeeIdRaw);
  if (!key) {
    return res.status(400).json({ error: "Invalid employeeId" });
  }

  const rateKey = `${clientIp(req)}:${key}`;
  const blocked = isLoginBlocked(rateKey);
  if (blocked.blocked) {
    res.setHeader("Retry-After", String(blocked.retryAfterSec || 60));
    return res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
  }

  try {
    const snap = await getDb().collection(COL).doc(key).get();
    if (!snap.exists) {
      registerLoginFailure(rateKey);
      return res.status(401).json({ error: "Unknown employee or wrong credentials" });
    }
    const data = snap.data() || {};
    const ok = await verifyPin(pin, data);
    if (!ok) {
      registerLoginFailure(rateKey);
      return res.status(401).json({ error: "Unknown employee or wrong credentials" });
    }

    if (typeof data.pin === "string" && data.pin.length === 6 && !data.pinHash) {
      try {
        const pinHash = await hashPin(pin);
        await snap.ref.set({ pinHash, pin: FieldValue.delete() }, { merge: true });
      } catch (e) {
        console.warn("login pin upgrade", e);
      }
    }

    const workerName = String(data.workerName || "").trim();
    if (!workerName) {
      return res.status(500).json({ error: "Roster record missing workerName; contact admin" });
    }

    clearLoginFailures(rateKey);

    const token = signWorkerSession({
      employeeId: employeeIdRaw,
      workerName,
    });

    const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const secure = proto === "https";

    setWorkerCookie(res, token, { secure });

    return res.status(200).json({ ok: true, employeeId: employeeIdRaw, workerName });
  } catch (e) {
    console.error("login", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
