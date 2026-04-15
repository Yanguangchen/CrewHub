import {
  getTimesheetOpen,
  postTimesheetClockOut,
  postTimesheetMeal,
  postTimesheetDeleteOpen,
} from "./api-worker.js";

/**
 * @param {{ workerName: string, siteName: string, dateKey: string }} p workerName is ignored; server uses session
 * @returns {Promise<{ id: string, data: object } | null>}
 */
export async function findOpenTimesheetForDay({ siteName, dateKey }) {
  if (!siteName || !dateKey) return null;
  const res = await getTimesheetOpen(siteName, dateKey);
  if (!res?.open || !res.timesheetId) return null;
  return { id: res.timesheetId, data: res.data };
}

/**
 * @param {string} docId
 * @param {Date} [clockOutDate]
 * @returns {Promise<{ eligibleForMeal: boolean }>}
 */
export async function updateTimesheetClockOut(docId, clockOutDate = new Date()) {
  const data = await postTimesheetClockOut(docId, clockOutDate);
  return { eligibleForMeal: !!data.eligibleForMeal };
}

/**
 * @param {string} docId
 * @param {boolean} claimedMeal
 */
export async function updateTimesheetMealClaim(docId, claimedMeal) {
  await postTimesheetMeal(docId, claimedMeal);
}

/**
 * Remove an open shift (no clock-out). Worker session cookie required.
 * @param {string} docId
 */
export async function deleteOpenTimesheet(docId) {
  await postTimesheetDeleteOpen(docId);
}
