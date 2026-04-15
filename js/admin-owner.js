/**
 * Primary CrewHub admin (Firebase Auth UID). This account:
 * - Passes the admin.html Google gate
 * - May read/write `worker_credentials` and read `timesheets` / `fleet_claims` in Firestore (see firestore.rules)
 * - Worker/driver data changes go through `/api/*`; Storage `fleet_claims/**` is server-only
 *
 * Keep in sync with `CREWHUB_PRIMARY_ADMIN_UID` in `api/lib/adminAuth.js` and `isCrewOwner()` in `firestore.rules`.
 * Add more UIDs here (and in rules + server) if you need additional admins.
 */
export const CREWHUB_PRIMARY_ADMIN_UID = "aWzsqY6sT5SjVjMI1jJHs5rOddw1";

export const ADMIN_OWNER_UIDS = new Set([CREWHUB_PRIMARY_ADMIN_UID]);

export function isAdminOwnerUid(uid) {
  return typeof uid === "string" && ADMIN_OWNER_UIDS.has(uid);
}
