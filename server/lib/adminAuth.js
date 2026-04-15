import { getAuthAdmin } from "./firebaseAdmin.js";

/**
 * Primary owner UID — same as `CREWHUB_PRIMARY_ADMIN_UID` in `js/admin-owner.js`
 * and `isCrewOwner()` in `firestore.rules`. Always allowed on Google admin API routes.
 */
const CREWHUB_PRIMARY_ADMIN_UID = "aWzsqY6sT5SjVjMI1jJHs5rOddw1";

/**
 * Primary owner plus optional `ADMIN_UIDS` (comma-separated) for extra admins.
 */
function getAllowedAdminUids() {
  const s = new Set([CREWHUB_PRIMARY_ADMIN_UID]);
  const raw = process.env.ADMIN_UIDS || "";
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (t) s.add(t);
  }
  return s;
}

function isGoogleProvider(decoded) {
  const sig = decoded.firebase?.sign_in_provider;
  return sig === "google.com";
}

/**
 * Verifies Firebase ID token and requires Google sign-in + allowed UID (owner always allowed).
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<{ uid: string, email: string }>}
 */
export async function requireAdminFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]?.trim()) {
    const err = new Error("Missing or invalid Authorization header");
    /** @type {any} */ (err).status = 401;
    throw err;
  }
  const idToken = m[1].trim();
  let decoded;
  try {
    decoded = await getAuthAdmin().verifyIdToken(idToken);
  } catch {
    const err = new Error("Invalid or expired token");
    /** @type {any} */ (err).status = 401;
    throw err;
  }
  if (!isGoogleProvider(decoded)) {
    const err = new Error("Admin API requires Google sign-in");
    /** @type {any} */ (err).status = 403;
    throw err;
  }
  const uid = String(decoded.uid || "");
  const allowedUids = getAllowedAdminUids();
  if (!allowedUids.has(uid)) {
    const err = new Error("Not an authorized admin");
    /** @type {any} */ (err).status = 403;
    throw err;
  }
  const email = String(decoded.email || "").toLowerCase().trim();
  return { uid, email };
}
