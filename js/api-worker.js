/**
 * Browser calls to Vercel `/api/*` (same origin when the static app and API are deployed together).
 * Local preview: run `npm run preview` (vercel dev) from the repo root and open the printed localhost URL.
 * Remote API from Live Server: set localStorage `crewhub_api_origin` or `window.__CREWHUB_API_ORIGIN__` before modules load (cross-origin cookies may break login).
 */
export function apiOrigin() {
  if (typeof window !== "undefined" && window.__CREWHUB_API_ORIGIN__) {
    return String(window.__CREWHUB_API_ORIGIN__).replace(/\/$/, "");
  }
  return "";
}

/** Shown when /api/* is missing (static host) or rejects POST (405). */
function workerApiMissingHint(status) {
  if (status === 404 || status === 405 || status === 501) {
    return (
      " Worker PIN login and clock-in need the CrewHub serverless API (/api/login, etc.). " +
      "Open the app from your Vercel deployment (same origin as /api), or set window.__CREWHUB_API_ORIGIN__ = 'https://your-project.vercel.app' before scripts load. " +
      "Plain static hosts (Live Server, python -m http.server, raw Firebase Hosting without Functions) cannot serve POST /api/login — you will see 404 or 405."
    );
  }
  return "";
}

export async function getSession() {
  const r = await fetch(`${apiOrigin()}/api/session`, {
    method: "GET",
    credentials: "include",
  });
  if (r.status === 401) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.workerName) return null;
  return data;
}

export async function postLogin(body) {
  const r = await fetch(`${apiOrigin()}/api/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = workerApiMissingHint(r.status);
    throw new Error((data.error || data.message || `Login failed (${r.status})`) + hint);
  }
  return data;
}

export async function postLogout() {
  const r = await fetch(`${apiOrigin()}/api/logout`, {
    method: "POST",
    credentials: "include",
  });
  await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error("Logout failed" + workerApiMissingHint(r.status));
  }
}

/**
 * Submit driver diesel claim with base64-encoded photos (JSON). Same session cookie as login.
 * @param {Record<string, unknown>} payload
 */
export async function postDriverClaim(payload) {
  const r = await fetch(`${apiOrigin()}/api/driver-claim`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = workerApiMissingHint(r.status);
    throw new Error((data.error || data.message || `Claim failed (${r.status})`) + hint);
  }
  return data;
}

export async function postClockIn(body) {
  const r = await fetch(`${apiOrigin()}/api/clock-in`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = workerApiMissingHint(r.status);
    throw new Error((data.error || data.message || `Clock-in failed (${r.status})`) + hint);
  }
  return data;
}

/**
 * Server-side roster write (bypasses Firestore rules). Requires deployed `/api/roster-upsert` and `apiOrigin()`.
 * @param {{ employeeId: string, workerName: string, pin: string }} body
 * @param {string} idToken Firebase ID token (Google admin)
 */
export async function postRosterUpsert(body, idToken) {
  const origin = apiOrigin();
  if (!origin) {
    throw new Error("Set window.__CREWHUB_API_ORIGIN__ to your API base URL to save via server.");
  }
  const r = await fetch(`${origin}/api/roster-upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || data.message || `Save failed (${r.status})`);
  }
  return data;
}

