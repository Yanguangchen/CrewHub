/**
 * Primary CrewHub admin (Firebase Auth UID). This account:
 * - Passes the admin.html Google gate
 * - May read/write `worker_credentials` in Firestore (see `isCrewOwner()` in firestore.rules)
 * - Uses the same `timesheets` / `fleet_claims` / Storage rules as any signed-in user for the dashboard
 *
 * Keep in sync with `CREWHUB_PRIMARY_ADMIN_UID` in `api/lib/adminAuth.js` and `isCrewOwner()` in `firestore.rules`.
 * Add more UIDs here (and in rules + server) if you need additional admins.
 */
export const CREWHUB_PRIMARY_ADMIN_UID = "aWzsqY6sT5SjVjMI1jJHs5rOddw1";

export const ADMIN_OWNER_UIDS = new Set([CREWHUB_PRIMARY_ADMIN_UID]);

export function isAdminOwnerUid(uid) {
  return typeof uid === "string" && ADMIN_OWNER_UIDS.has(uid);
}
