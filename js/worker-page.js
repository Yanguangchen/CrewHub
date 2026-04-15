import { isConfigReady } from "./firebase-client.js";
import { formatDateKey, formatTs, showMessage } from "./crewhub-helpers.js";
import { bootstrapAuth } from "./crewhub-auth.js";
import { initThemePicker } from "./ui.js";
import { sanitizePin, bindPinInput } from "./crewhub-identity.js";
import {
  updateTimesheetClockOut,
  updateTimesheetMealClaim,
  deleteOpenTimesheet,
  findOpenTimesheetForDay,
} from "./timesheets-crud.js";
import { postLogin, postClockIn, postLogout, getSession } from "./api-worker.js";

const COOLDOWN_MS = 15 * 60 * 1000;
const SITE_STORAGE_KEY = "crewhub_worker_site_v1";
const STEP_SITE = 1;
const STEP_LOGIN = 2;
const STEP_CLOCK = 3;

initThemePicker();

let sessionWorkerName = "";
let sessionEmployeeId = "";
/** Job site chosen in step 1; used for clock-in and resume (no dropdown on clock screen). */
let wizardSelectedSite = "";
let activeTimesheetId = null;
let mealEligibleDocId = null;
let clockInTimeDisplay = null;
/** After clock-out or undo, next time clock-in is allowed (anti-spam). */
let nextAllowedClockInAt = 0;
let cooldownIntervalId = 0;
let busyClockIn = false;
let busyClockOut = false;

const siteScreen = document.getElementById("workerSiteScreen");
const loginScreen = document.getElementById("workerLoginScreen");
const clockScreen = document.getElementById("workerClockScreen");
const wizardSiteName = document.getElementById("wizardSiteName");
const btnSiteNext = document.getElementById("btnWorkerSiteNext");
const workerSiteMessage = document.getElementById("workerSiteMessage");
const btnBackToSite = document.getElementById("btnWorkerBackToSite");
const btnChangeSite = document.getElementById("btnWorkerChangeSite");
const atmEmployeeId = document.getElementById("atmEmployeeId");
const atmPin = document.getElementById("atmPin");
const atmForm = document.getElementById("workerAtmLoginForm");
const btnSecureLogin = document.getElementById("btnWorkerSecureLogin");
const workerLoginMessage = document.getElementById("workerLoginMessage");
const workerWelcomeName = document.getElementById("workerWelcomeName");
const workerDisplaySite = document.getElementById("workerDisplaySite");
const btnSignOut = document.getElementById("btnWorkerSignOut");
const workerShiftStatus = document.getElementById("workerShiftStatus");
const btnClockIn = document.getElementById("btnClockIn");
const btnClockOut = document.getElementById("btnClockOut");
const btnCancelClockIn = document.getElementById("btnCancelClockIn");
const workerCooldownHint = document.getElementById("workerCooldownHint");
const mealWrap = document.getElementById("mealWrap");
const mealRegisterBtn = document.getElementById("mealRegisterBtn");
const MEAL_BTN_DEFAULT = "Register meal taken";
const MEAL_BTN_DONE = "Meal recorded";

bindPinInput(atmPin);

function persistWizardSite() {
  if (wizardSelectedSite) {
    try {
      sessionStorage.setItem(SITE_STORAGE_KEY, wizardSelectedSite);
    } catch (e) {
      console.warn("persist site", e);
    }
  }
}

function clearPersistedSite() {
  try {
    sessionStorage.removeItem(SITE_STORAGE_KEY);
  } catch (e) {
    console.warn("clear site", e);
  }
}

function readPersistedSite() {
  try {
    return String(sessionStorage.getItem(SITE_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setSiteMessage(text, isError = false) {
  if (!workerSiteMessage) return;
  workerSiteMessage.textContent = text;
  workerSiteMessage.classList.toggle("is-error", isError);
}

function setLoginMessage(text, isError = false) {
  if (!workerLoginMessage) return;
  workerLoginMessage.textContent = text;
  workerLoginMessage.classList.toggle("is-error", isError);
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle("is-loading", loading);
  btn.setAttribute("aria-busy", loading ? "true" : "false");
}

function syncSiteSelectFromWizard() {
  if (!wizardSiteName) return;
  const want = wizardSelectedSite;
  const opts = Array.from(wizardSiteName.options);
  const idx = opts.findIndex((o) => o.value === want || o.textContent.trim() === want);
  if (idx >= 0) wizardSiteName.selectedIndex = idx;
}

function showPanel(el, visible) {
  if (!el) return;
  el.classList.toggle("is-hidden", !visible);
  el.hidden = !visible;
}

function syncClockHeader() {
  if (workerWelcomeName) workerWelcomeName.textContent = sessionWorkerName || "—";
  if (workerDisplaySite) workerDisplaySite.textContent = wizardSelectedSite || "—";
}

/** @param {1|2|3} step */
function showWorkerStep(step) {
  showPanel(siteScreen, step === STEP_SITE);
  showPanel(loginScreen, step === STEP_LOGIN);
  showPanel(clockScreen, step === STEP_CLOCK);
  if (step === STEP_CLOCK) syncClockHeader();
  refreshClockUi();
}

function getClockSite() {
  return String(wizardSelectedSite || "").trim();
}

function resetWizardAfterSignOut() {
  sessionWorkerName = "";
  sessionEmployeeId = "";
  wizardSelectedSite = "";
  activeTimesheetId = null;
  mealEligibleDocId = null;
  clockInTimeDisplay = null;
  hideMealAllowanceUI();
  clearPersistedSite();
  if (wizardSiteName) wizardSiteName.selectedIndex = 0;
  if (atmPin) atmPin.value = "";
  if (atmEmployeeId) atmEmployeeId.value = "";
  setSiteMessage("");
  setLoginMessage("");
  clearCooldownTicker();
  showWorkerStep(STEP_SITE);
}

function clearCooldownTicker() {
  if (cooldownIntervalId) {
    clearInterval(cooldownIntervalId);
    cooldownIntervalId = 0;
  }
}

function ensureCooldownTicker() {
  clearCooldownTicker();
  if (Date.now() >= nextAllowedClockInAt) return;
  cooldownIntervalId = window.setInterval(() => {
    refreshClockUi();
    if (Date.now() >= nextAllowedClockInAt) clearCooldownTicker();
  }, 1000);
}

function isClockInCoolingDown() {
  return Date.now() < nextAllowedClockInAt;
}

function syncShiftStatusLine() {
  if (!workerShiftStatus) return;
  if (activeTimesheetId && clockInTimeDisplay) {
    workerShiftStatus.textContent = `Status: Clocked In at ${clockInTimeDisplay}`;
  } else if (activeTimesheetId) {
    workerShiftStatus.textContent = "Status: Clocked In";
  } else {
    workerShiftStatus.textContent = "Status: Not Clocked In";
  }
}

function syncCooldownHint() {
  if (!workerCooldownHint) return;
  const left = nextAllowedClockInAt - Date.now();
  if (left > 0 && !activeTimesheetId) {
    const m = Math.floor(left / 60000);
    const s = Math.ceil((left % 60000) / 1000);
    workerCooldownHint.hidden = false;
    workerCooldownHint.textContent =
      m > 0
        ? `Next clock-in allowed in ${m} min ${s} s (cooldown after last clock-out).`
        : `Next clock-in allowed in ${s} s (cooldown after last clock-out).`;
  } else {
    workerCooldownHint.hidden = true;
    workerCooldownHint.textContent = "";
  }
}

function syncChangeSiteLink() {
  if (!btnChangeSite) return;
  const onClock = clockScreen && !clockScreen.hidden;
  const can =
    onClock &&
    !!sessionWorkerName &&
    !activeTimesheetId &&
    !busyClockOut &&
    !busyClockIn;
  btnChangeSite.hidden = !can;
}

function refreshClockUi() {
  const loggedIn = !!sessionWorkerName;
  const siteName = getClockSite();
  const clockedIn = !!activeTimesheetId;
  const cooling = isClockInCoolingDown();

  syncShiftStatusLine();
  syncCooldownHint();

  if (btnClockIn) {
    const canClockIn =
      loggedIn &&
      !!siteName &&
      !clockedIn &&
      !cooling &&
      !busyClockIn &&
      isConfigReady();
    btnClockIn.disabled = !canClockIn;
  }
  if (btnClockOut) {
    btnClockOut.disabled = !clockedIn || busyClockOut || !isConfigReady();
  }
  if (btnCancelClockIn) {
    btnCancelClockIn.disabled = !clockedIn || busyClockOut || !isConfigReady();
  }

  if (mealRegisterBtn && mealEligibleDocId) {
    mealRegisterBtn.disabled = !loggedIn;
  }

  syncChangeSiteLink();
}

function hideMealAllowanceUI() {
  mealEligibleDocId = null;
  if (mealRegisterBtn) {
    mealRegisterBtn.disabled = true;
    mealRegisterBtn.textContent = MEAL_BTN_DEFAULT;
    mealRegisterBtn.removeAttribute("aria-busy");
  }
  if (mealWrap) {
    mealWrap.hidden = true;
    mealWrap.classList.add("meal-wrap--off");
    mealWrap.setAttribute("aria-hidden", "true");
  }
  refreshClockUi();
}

function showMealAllowanceUI(docId) {
  mealEligibleDocId = docId;
  if (!mealWrap || !mealRegisterBtn) return;
  mealRegisterBtn.textContent = MEAL_BTN_DEFAULT;
  mealRegisterBtn.disabled = false;
  mealRegisterBtn.removeAttribute("aria-busy");
  mealWrap.classList.remove("meal-wrap--off");
  mealWrap.hidden = false;
  mealWrap.setAttribute("aria-hidden", "false");
  refreshClockUi();
}

async function attemptResumeOpenShift() {
  if (!isConfigReady() || !sessionWorkerName || activeTimesheetId) return;
  const siteName = getClockSite();
  if (!siteName) return;
  const dateKey = formatDateKey(new Date());
  try {
    const open = await findOpenTimesheetForDay({
      workerName: sessionWorkerName,
      siteName,
      dateKey,
    });
    if (!open) return;
    activeTimesheetId = open.id;
    clockInTimeDisplay = formatTs(open.data.clockInTime);
    showMessage("workerMessage", "Resumed your open shift from today.");
    refreshClockUi();
  } catch (e) {
    console.error(e);
    showMessage("workerMessage", e.message || "Could not check for an open shift.", true);
  }
}

btnSiteNext?.addEventListener("click", () => {
  setSiteMessage("");
  const raw = wizardSiteName?.value?.trim() || "";
  if (!raw) {
    setSiteMessage("Select a job site to continue.", true);
    wizardSiteName?.focus();
    return;
  }
  wizardSelectedSite = raw;
  persistWizardSite();

  if (sessionWorkerName) {
    syncClockHeader();
    showWorkerStep(STEP_CLOCK);
    void attemptResumeOpenShift();
    return;
  }

  showWorkerStep(STEP_LOGIN);
});

btnBackToSite?.addEventListener("click", () => {
  setLoginMessage("");
  if (atmPin) atmPin.value = "";
  showWorkerStep(STEP_SITE);
  syncSiteSelectFromWizard();
  wizardSiteName?.focus();
});

btnChangeSite?.addEventListener("click", () => {
  if (activeTimesheetId || busyClockIn || busyClockOut) return;
  showWorkerStep(STEP_SITE);
  syncSiteSelectFromWizard();
  wizardSiteName?.focus();
});

atmForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoginMessage("");
  const employeeId = atmEmployeeId?.value?.trim() || "";
  const pin = sanitizePin(atmPin?.value || "");
  if (!employeeId) {
    setLoginMessage("Enter your phone number or employee ID.", true);
    atmEmployeeId?.focus();
    return;
  }
  if (pin.length !== 6) {
    setLoginMessage("PIN must be exactly 6 digits.", true);
    atmPin?.focus();
    return;
  }

  setBtnLoading(btnSecureLogin, true);
  try {
    const data = await postLogin({ employeeId, pin });
    sessionWorkerName = data.workerName || "";
    sessionEmployeeId = data.employeeId || employeeId;
    if (!sessionWorkerName) {
      throw new Error("Server did not return worker name.");
    }
    persistWizardSite();
    syncClockHeader();
    showWorkerStep(STEP_CLOCK);
    void attemptResumeOpenShift();
    refreshClockUi();
  } catch (err) {
    console.error(err);
    setLoginMessage(err.message || "Login failed.", true);
  } finally {
    setBtnLoading(btnSecureLogin, false);
  }
});

btnSignOut?.addEventListener("click", async () => {
  try {
    await postLogout();
  } catch (e) {
    console.error(e);
  }
  nextAllowedClockInAt = 0;
  showMessage("workerMessage", "");
  resetWizardAfterSignOut();
});

btnClockIn?.addEventListener("click", async () => {
  showMessage("workerMessage", "");
  if (!sessionWorkerName) {
    showMessage("workerMessage", "Please sign in again.", true);
    return;
  }
  const siteName = getClockSite();
  if (!siteName) {
    showMessage("workerMessage", "Go back and select your job site.", true);
    return;
  }
  if (activeTimesheetId || isClockInCoolingDown()) {
    return;
  }

  busyClockIn = true;
  setBtnLoading(btnClockIn, true);
  refreshClockUi();
  try {
    const data = await postClockIn({
      siteName,
      date: formatDateKey(new Date()),
    });
    activeTimesheetId = data.timesheetId;
    clockInTimeDisplay = new Date().toLocaleString();
    hideMealAllowanceUI();
    showMessage("workerMessage", "Clocked in. Stay safe on site.");
  } catch (e) {
    console.error(e);
    showMessage("workerMessage", e.message || "Clock-in failed.", true);
  } finally {
    busyClockIn = false;
    setBtnLoading(btnClockIn, false);
    refreshClockUi();
  }
});

btnClockOut?.addEventListener("click", async () => {
  showMessage("workerMessage", "");
  if (!activeTimesheetId) {
    showMessage("workerMessage", "Clock in first.", true);
    return;
  }
  const docId = activeTimesheetId;
  const now = new Date();
  busyClockOut = true;
  setBtnLoading(btnClockOut, true);
  refreshClockUi();
  try {
    const { eligibleForMeal } = await updateTimesheetClockOut(docId, now);

    activeTimesheetId = null;
    clockInTimeDisplay = null;
    nextAllowedClockInAt = Date.now() + COOLDOWN_MS;
    ensureCooldownTicker();

    if (eligibleForMeal) {
      showMealAllowanceUI(docId);
      showMessage("workerMessage", "Clocked out after 7:00 PM. You can register a meal below.");
    } else {
      hideMealAllowanceUI();
      showMessage("workerMessage", "Clocked out. A 15-minute cooldown applies before the next clock-in.");
    }
  } catch (e) {
    console.error(e);
    activeTimesheetId = docId;
    showMessage("workerMessage", e.message || "Clock-out failed.", true);
  } finally {
    busyClockOut = false;
    setBtnLoading(btnClockOut, false);
    refreshClockUi();
  }
});

btnCancelClockIn?.addEventListener("click", async () => {
  showMessage("workerMessage", "");
  if (!activeTimesheetId) return;
  if (!confirm("Cancel this clock-in? This removes today’s open shift from the log.")) return;
  const docId = activeTimesheetId;
  busyClockOut = true;
  refreshClockUi();
  try {
    await deleteOpenTimesheet(docId);
    activeTimesheetId = null;
    clockInTimeDisplay = null;
    nextAllowedClockInAt = Date.now() + COOLDOWN_MS;
    ensureCooldownTicker();
    hideMealAllowanceUI();
    showMessage("workerMessage", "Clock-in cancelled. A 15-minute cooldown applies before the next clock-in.");
  } catch (e) {
    console.error(e);
    showMessage("workerMessage", e.message || "Could not cancel clock-in.", true);
  } finally {
    busyClockOut = false;
    refreshClockUi();
  }
});

mealRegisterBtn?.addEventListener("click", async () => {
  if (!mealEligibleDocId || mealRegisterBtn.disabled) return;
  mealRegisterBtn.disabled = true;
  mealRegisterBtn.setAttribute("aria-busy", "true");
  try {
    await updateTimesheetMealClaim(mealEligibleDocId, true);
    mealRegisterBtn.textContent = MEAL_BTN_DONE;
    mealRegisterBtn.removeAttribute("aria-busy");
    showMessage("workerMessage", "Meal recorded for this shift.");
  } catch (e) {
    console.error(e);
    mealRegisterBtn.disabled = false;
    mealRegisterBtn.removeAttribute("aria-busy");
    showMessage("workerMessage", e.message || "Could not record meal.", true);
  }
  refreshClockUi();
});

async function initWorkerPage() {
  try {
    const s = await getSession();
    if (s?.workerName) {
      sessionWorkerName = s.workerName;
      sessionEmployeeId = s.employeeId || "";
      const saved = readPersistedSite();
      if (saved) {
        wizardSelectedSite = saved;
        syncSiteSelectFromWizard();
        syncClockHeader();
        showWorkerStep(STEP_CLOCK);
        if (isConfigReady()) {
          await attemptResumeOpenShift();
        }
        refreshClockUi();
        return;
      }
    }
  } catch (e) {
    console.warn("session check", e);
  }
  showWorkerStep(STEP_SITE);
  refreshClockUi();
}

bootstrapAuth({
  onSignedIn() {
    if (sessionWorkerName && isConfigReady() && getClockSite()) {
      void attemptResumeOpenShift().then(() => refreshClockUi());
    }
  },
});

hideMealAllowanceUI();
initWorkerPage();
