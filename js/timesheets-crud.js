import { getDb, collection, onSnapshot, query, orderBy, COL_TIMESHEETS } from "./firebase-client.js";
import { postTimesheetAdminDelete } from "./api-worker.js";

/**
 * @param {string} docId
 * @param {string} idToken Google ID token (admin)
 */
export async function deleteTimesheet(docId, idToken) {
  await postTimesheetAdminDelete(idToken, docId);
}

/** Live list of timesheets, newest clock-in first (admin + Firestore rules). */
export function subscribeTimesheets(onNext, onError) {
  const tq = query(collection(getDb(), COL_TIMESHEETS), orderBy("clockInTime", "desc"));
  return onSnapshot(tq, onNext, onError);
}
