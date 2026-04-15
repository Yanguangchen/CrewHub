import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const VERSION = "v1";
const SALT_BYTES = 16;
const KEYLEN = 32;

/**
 * @param {string} plainPin 6-digit digits only (caller validates length)
 * @returns {Promise<string>} Stored form: v1$<saltHex>$<scryptHex>
 */
export async function hashPin(plainPin) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plainPin, salt, KEYLEN);
  return `${VERSION}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * @param {string} plainPin
 * @param {{ pin?: unknown, pinHash?: unknown }} data Firestore doc fields
 * @returns {Promise<boolean>}
 */
export async function verifyPin(plainPin, data) {
  const ph = data?.pinHash;
  if (typeof ph === "string" && ph.startsWith(`${VERSION}$`)) {
    const parts = ph.split("$");
    if (parts.length !== 3) return false;
    try {
      const salt = Buffer.from(parts[1], "hex");
      const want = Buffer.from(parts[2], "hex");
      if (salt.length !== SALT_BYTES || want.length !== KEYLEN) return false;
      const derived = await scryptAsync(plainPin, salt, KEYLEN);
      return timingSafeEqual(want, derived);
    } catch {
      return false;
    }
  }
  const legacy = data?.pin;
  if (typeof legacy === "string" && legacy.length === 6) {
    return legacy === plainPin;
  }
  return false;
}
