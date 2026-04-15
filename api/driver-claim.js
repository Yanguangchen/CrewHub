/**
 * POST /api/driver-claim
 * JSON body: destination, mileage, receiptBase64, receiptMime, receiptName, meterBase64, meterMime, meterName
 * Requires HttpOnly worker session cookie. Uploads via Admin SDK (works with Vercel’s JSON body parsing).
 */
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firebaseAdmin.js";
import { saveClaimObject } from "./lib/claimStorage.js";
import { verifyWorkerSession, parseCookieHeader, COOKIE } from "./lib/sessionCookie.js";

const COL_CLAIMS = "fleet_claims";
/** Keep total JSON under Vercel’s ~4.5 MB body limit (base64 expands ~4/3). */
const MAX_IMAGE_BYTES = Math.floor(1.55 * 1024 * 1024);

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

function imageMimeOk(m) {
  const s = String(m || "").toLowerCase();
  return s.startsWith("image/");
}

function decodeImageB64(label, b64, mime) {
  const raw = String(b64 || "").replace(/\s+/g, "");
  if (!raw) {
    throw new Error(`${label} image missing`);
  }
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) {
    throw new Error(`${label} image is not valid base64`);
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(`${label} image too large (max about 1.5 MB each)`);
  }
  if (!imageMimeOk(mime)) {
    throw new Error(`${label} must be an image file`);
  }
  return buf;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawCookie = parseCookieHeader(req.headers.cookie || "", COOKIE);
  const session = verifyWorkerSession(rawCookie);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated; sign in on the driver screen first" });
  }

  const driverName = String(session.w || "").trim();
  const employeeId = String(session.e || "").trim();
  if (!driverName) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const body = parseBody(req);
  const destination = String(body.destination || "").trim();
  const mileageRaw = String(body.mileage ?? "").trim();
  const mileage = Number(mileageRaw);

  if (!destination) {
    return res.status(400).json({ error: "destination required" });
  }
  if (mileageRaw === "" || Number.isNaN(mileage)) {
    return res.status(400).json({ error: "mileage must be a number" });
  }

  let receiptBuf;
  let meterBuf;
  try {
    receiptBuf = decodeImageB64("Receipt", body.receiptBase64, body.receiptMime);
    meterBuf = decodeImageB64("Meter", body.meterBase64, body.meterMime);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Invalid images" });
  }

  const receiptName = String(body.receiptName || "receipt.jpg");
  const meterName = String(body.meterName || "meter.jpg");

  const claimFolder = randomUUID();

  try {
    const receiptPhotoUrl = await saveClaimObject({
      folder: claimFolder,
      kind: "receipt",
      buffer: receiptBuf,
      mimeType: String(body.receiptMime || "image/jpeg"),
      originalName: receiptName,
    });
    const dashboardPhotoUrl = await saveClaimObject({
      folder: claimFolder,
      kind: "meter",
      buffer: meterBuf,
      mimeType: String(body.meterMime || "image/jpeg"),
      originalName: meterName,
    });

    const submittedAt = Timestamp.now();
    const payload = {
      driverName,
      destination,
      mileage,
      receiptPhotoUrl,
      dashboardPhotoUrl,
      timestamp: submittedAt,
    };
    if (employeeId) payload.employeeId = employeeId;

    await getDb().collection(COL_CLAIMS).add(payload);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("driver-claim", e);
    const msg = e.message || "Server error";
    if (/does not exist|notFound|No such object|404/.test(msg)) {
      return res.status(500).json({
        error:
          "Storage bucket error. Set FIREBASE_STORAGE_BUCKET in .env.local to your bucket (Firebase Console → Storage).",
      });
    }
    return res.status(500).json({ error: msg });
  }
}
