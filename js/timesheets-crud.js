import {
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  COL_TIMESHEETS,
} from "./firebase-client.js";
import { formatDateKey } from "./crewhub-helpers.js";

function isStrictlyAfterSevenPM(date) {
  const d = new Date(date);
  const cutoff = new Date(d);
  cutoff.setHours(19, 0, 0, 0);
  return d.getTime() > cutoff.getTime();
}

/**
 * @param {{ workerName: string, siteName: string, clockInDate?: Date, employeeId?: string | null }} p
 * @returns {Promise<string>} new document id
 */
export async function createTimesheet({ workerName, siteName, clockInDate = new Date(), employeeId = null }) {
  const payload = {
    workerName,
    siteName,
    clockInTime: Timestamp.fromDate(clockInDate),
    clockOutTime: null,
    claimedMeal: false,
    date: formatDateKey(clockInDate),
  };
  const id = employeeId?.trim();
  if (id) payload.employeeId = id;
  const refDoc = await addDoc(collection(db, COL_TIMESHEETS), payload);
  return refDoc.id;
}

/**
 * @param {string} docId
 * @param {Date} [clockOutDate]
 * @returns {Promise<{ eligibleForMeal: boolean }>}
 */
export async function updateTimesheetClockOut(docId, clockOutDate = new Date()) {
  const eligible = isStrictlyAfterSevenPM(clockOutDate);
  const payload = {
    clockOutTime: Timestamp.fromDate(clockOutDate),
  };
  if (!eligible) {
    payload.claimedMeal = false;
  }
  await updateDoc(doc(db, COL_TIMESHEETS, docId), payload);
  return { eligibleForMeal: eligible };
}

/**
 * @param {string} docId
 * @param {boolean} claimedMeal
 */
export async function updateTimesheetMealClaim(docId, claimedMeal) {
  await updateDoc(doc(db, COL_TIMESHEETS, docId), { claimedMeal });
}

/**
 * @param {string} docId
 */
export async function deleteTimesheet(docId) {
  await deleteDoc(doc(db, COL_TIMESHEETS, docId));
}

/**
 * Remove an open shift (no clock-out). Used by worker “Undo clock-in”.
 * @param {string} docId
 */
export async function deleteOpenTimesheet(docId) {
  const snap = await getDoc(doc(db, COL_TIMESHEETS, docId));
  if (!snap.exists()) {
    throw new Error("Shift not found.");
  }
  const data = snap.data();
  if (data.clockOutTime != null) {
    throw new Error("This shift is already closed. Ask an admin to edit the record if needed.");
  }
  await deleteDoc(snap.ref);
}

/**
 * Find today’s open timesheet for worker + site (clock-out still null).
 * @param {{ workerName: string, siteName: string, dateKey: string }} p
 * @returns {Promise<{ id: string, data: object } | null>}
 */
export async function findOpenTimesheetForDay({ workerName, siteName, dateKey }) {
  if (!workerName || !siteName || !dateKey) return null;
  const q = query(collection(db, COL_TIMESHEETS), where("date", "==", dateKey));
  const snap = await getDocs(q);
  const match = snap.docs.find((d) => {
    const x = d.data();
    return x.workerName === workerName && x.siteName === siteName && x.clockOutTime == null;
  });
  return match ? { id: match.id, data: match.data() } : null;
}

/** Live list of timesheets, newest clock-in first. */
export function subscribeTimesheets(onNext, onError) {
  const tq = query(collection(db, COL_TIMESHEETS), orderBy("clockInTime", "desc"));
  return onSnapshot(tq, onNext, onError);
}
