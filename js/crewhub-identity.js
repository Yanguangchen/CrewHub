/**
 * Per-person identity on this device (sessionStorage). ID + 6-digit PIN unlock
 * a session key so worker/driver actions are isolated to that selection.
 * PIN is not stored — only checked at unlock time.
 */

const STORAGE_PREFIX = "crewhub-identity:";

export function sanitizePin(value) {
  return String(value).replace(/\D/g, "").slice(0, 6);
}

/** @returns {string | null} */
export function workerPersonKey(siteName, workerName) {
  const site = String(siteName || "").trim();
  const worker = String(workerName || "").trim();
  if (!site || !worker) return null;
  return `worker:${site}|${worker}`;
}

/** @returns {{ employeeId: string, at: number } | null} */
export function readIdentity(personKey) {
  if (!personKey) return null;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${personKey}`);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.employeeId !== "string" || !o.employeeId.trim()) return null;
    return { employeeId: o.employeeId.trim(), at: Number(o.at) || 0 };
  } catch {
    return null;
  }
}

/** @param {string | null} personKey */
export function writeIdentity(personKey, employeeId) {
  if (!personKey) return;
  sessionStorage.setItem(
    `${STORAGE_PREFIX}${personKey}`,
    JSON.stringify({ employeeId: String(employeeId).trim(), at: Date.now() })
  );
}

/** @param {string | null} personKey */
export function clearIdentity(personKey) {
  if (!personKey) return;
  sessionStorage.removeItem(`${STORAGE_PREFIX}${personKey}`);
}

export function isUnlocked(personKey) {
  return readIdentity(personKey) != null;
}

/** @param {string | null} personKey */
export function getEmployeeId(personKey) {
  return readIdentity(personKey)?.employeeId ?? null;
}

/**
 * @param {HTMLInputElement | null} pinInput
 */
export function bindPinInput(pinInput) {
  if (!pinInput) return;
  pinInput.addEventListener("input", () => {
    const v = sanitizePin(pinInput.value);
    if (pinInput.value !== v) pinInput.value = v;
  });
  pinInput.addEventListener("beforeinput", (e) => {
    if (e.data && /\D/.test(e.data)) e.preventDefault();
  });
  pinInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const t = sanitizePin(e.clipboardData?.getData("text") || "");
    pinInput.value = t;
  });
}
