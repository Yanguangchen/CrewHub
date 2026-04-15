import {
  auth,
  db,
  collection,
  onSnapshot,
  query,
  orderBy,
  COL_CLAIMS,
  isConfigReady,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "./firebase-client.js";
import { subscribeTimesheets, deleteTimesheet } from "./timesheets-crud.js";
import { formatTs } from "./crewhub-helpers.js";
import { initThemePicker, bindTabGroup, escapeHtml, attrSafe } from "./ui.js";
import { sanitizePin } from "./crewhub-identity.js";
import { isAdminOwnerUid } from "./admin-owner.js";
import { postRosterUpsert } from "./api-worker.js";

initThemePicker();

const authGate = document.getElementById("adminAuthGate");
const viewAdmin = document.getElementById("view-admin");
const btnAdminGoogleSignIn = document.getElementById("btnAdminGoogleSignIn");
const btnAdminGoogleRedirect = document.getElementById("btnAdminGoogleRedirect");
const adminAuthError = document.getElementById("adminAuthError");
const authStatus = document.getElementById("authStatus");
const adminSignedInEmail = document.getElementById("adminSignedInEmail");
const btnAdminSignOut = document.getElementById("btnAdminSignOut");

bindTabGroup({
  tabButtons: document.querySelectorAll("[data-admin-tab]"),
  panesByKey: {
    timesheets: document.getElementById("adminTimesheets"),
    claims: document.getElementById("adminClaims"),
    roster: document.getElementById("adminRoster"),
  },
  initialKey: "timesheets",
});

const timesheetRows = document.getElementById("timesheetRows");
const claimRows = document.getElementById("claimRows");

function renderTimesheets(snapshot) {
  if (!timesheetRows) return;
  timesheetRows.innerHTML = "";
  snapshot.forEach((d) => {
    const r = d.data();
    const tr = document.createElement("tr");
    const meal = r.claimedMeal ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>';
    const delId = escapeHtml(d.id);
    tr.innerHTML = `
      <td>${escapeHtml(r.workerName || "")}</td>
      <td>${escapeHtml(r.siteName || "")}</td>
      <td>${escapeHtml(r.employeeId || "—")}</td>
      <td>${escapeHtml(formatTs(r.clockInTime))}</td>
      <td>${escapeHtml(formatTs(r.clockOutTime))}</td>
      <td>${meal}</td>
      <td>${escapeHtml(r.date || "")}</td>
      <td class="table-actions"><button type="button" class="link-btn" data-timesheet-delete="${delId}">Delete</button></td>
    `;
    timesheetRows.appendChild(tr);
  });
}

function renderClaims(snapshot) {
  if (!claimRows) return;
  claimRows.innerHTML = "";
  snapshot.forEach((d) => {
    const r = d.data();
    const tr = document.createElement("tr");
    const receiptBtn = r.receiptPhotoUrl
      ? `<a class="link-btn" href="${attrSafe(r.receiptPhotoUrl)}" target="_blank" rel="noopener">Receipt</a>`
      : "—";
    const dashBtn = r.dashboardPhotoUrl
      ? `<a class="link-btn" href="${attrSafe(r.dashboardPhotoUrl)}" target="_blank" rel="noopener">Meter</a>`
      : "—";
    tr.innerHTML = `
      <td>${escapeHtml(r.driverName || "")}</td>
      <td>${escapeHtml(r.employeeId || "—")}</td>
      <td>${escapeHtml(r.destination || "")}</td>
      <td>${escapeHtml(String(r.mileage ?? ""))}</td>
      <td>${receiptBtn}</td>
      <td>${dashBtn}</td>
      <td>${escapeHtml(formatTs(r.timestamp))}</td>
    `;
    claimRows.appendChild(tr);
  });
}

let adminListenersStarted = false;
/** @type {null | (() => void)} */
let unsubTimesheets = null;
/** @type {null | (() => void)} */
let unsubClaims = null;

function stopAdminListeners() {
  if (unsubTimesheets) {
    unsubTimesheets();
    unsubTimesheets = null;
  }
  if (unsubClaims) {
    unsubClaims();
    unsubClaims = null;
  }
  adminListenersStarted = false;
}

function startAdminListeners() {
  if (adminListenersStarted || !isConfigReady()) return;
  unsubTimesheets = subscribeTimesheets(renderTimesheets, (err) => console.error("timesheets listener", err));

  const cq = query(collection(db, COL_CLAIMS), orderBy("timestamp", "desc"));
  unsubClaims = onSnapshot(cq, renderClaims, (err) => console.error("claims listener", err));
  adminListenersStarted = true;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function setGateError(text) {
  if (adminAuthError) {
    adminAuthError.textContent = text;
    adminAuthError.classList.toggle("is-error", !!text);
  }
}

function setGoogleBtnLoading(loading) {
  if (btnAdminGoogleSignIn) {
    btnAdminGoogleSignIn.classList.toggle("is-loading", loading);
    btnAdminGoogleSignIn.setAttribute("aria-busy", loading ? "true" : "false");
    btnAdminGoogleSignIn.disabled = loading;
  }
  if (btnAdminGoogleRedirect) btnAdminGoogleRedirect.disabled = loading;
}

function explainNetworkAuthFailure() {
  return (
    "Could not reach Google / Firebase (network). Fix: open this app over http:// or https:// (not file://). " +
    "Firebase Console → Authentication → Settings → Authorized domains: add this page’s hostname (e.g. localhost, 127.0.0.1). " +
    "Google Cloud → APIs & Services → Credentials → your browser API key: set Application restrictions to “None” for local testing, or add your dev URL. " +
    "Temporarily disable ad blockers / privacy extensions for this site."
  );
}

/**
 * @param {"popup" | "redirect"} mode
 */
async function runGoogleSignIn(mode) {
  setGateError("");
  if (location.protocol === "file:") {
    setGateError(
      "Firebase sign-in does not work from file://. Run a local server (e.g. npx serve . or VS Code Live Server) and open admin.html over http://localhost."
    );
    return;
  }
  if (!isConfigReady()) {
    if (authStatus) authStatus.textContent = "Add your Firebase config to firebase-config.js to enable sign-in.";
    return;
  }
  setGoogleBtnLoading(true);
  try {
    if (mode === "redirect") {
      await signInWithRedirect(auth, googleProvider);
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  } catch (err) {
    console.error(err);
    const code = err?.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      setGateError("");
    } else if (code === "auth/network-request-failed") {
      setGateError(explainNetworkAuthFailure());
    } else {
      setGateError(err?.message || "Sign-in failed.");
    }
  } finally {
    setGoogleBtnLoading(false);
  }
}

function showAuthGate() {
  if (authGate) {
    authGate.classList.remove("is-hidden");
    authGate.hidden = false;
  }
  if (viewAdmin) {
    viewAdmin.classList.add("is-hidden");
    viewAdmin.hidden = true;
  }
}

function hideAuthGate() {
  if (authGate) {
    authGate.classList.add("is-hidden");
    authGate.hidden = true;
  }
  if (viewAdmin) {
    viewAdmin.classList.remove("is-hidden");
    viewAdmin.hidden = false;
  }
}

function normEmployeeIdForRoster(id) {
  return String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 128);
}

timesheetRows?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-timesheet-delete]");
  if (!btn || !isConfigReady()) return;
  const id = btn.getAttribute("data-timesheet-delete");
  if (!id) return;
  if (!confirm("Delete this timesheet permanently?")) return;
  const user = auth.currentUser;
  if (!user) {
    alert("Sign in again.");
    return;
  }
  try {
    const idToken = await user.getIdToken();
    await deleteTimesheet(id, idToken);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Delete failed.");
  }
});

btnAdminGoogleSignIn?.addEventListener("click", () => {
  void runGoogleSignIn("popup");
});

btnAdminGoogleRedirect?.addEventListener("click", () => {
  void runGoogleSignIn("redirect");
});

btnAdminSignOut?.addEventListener("click", () => {
  setGateError("");
  signOut(auth).catch((e) => console.error(e));
});

document.getElementById("rosterForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const rosterMessage = document.getElementById("rosterMessage");
  const setRosterMsg = (t, err = false) => {
    if (!rosterMessage) return;
    rosterMessage.textContent = t;
    rosterMessage.style.color = err ? "#fb7185" : "";
  };
  const employeeIdRaw = document.getElementById("rosterEmployeeId")?.value?.trim() || "";
  const workerName = document.getElementById("rosterWorkerName")?.value?.trim() || "";
  const pin = sanitizePin(document.getElementById("rosterPin")?.value || "");
  if (!employeeIdRaw || !workerName || pin.length !== 6) {
    setRosterMsg("Fill employee ID, worker name, and 6-digit PIN.", true);
    return;
  }
  const user = auth.currentUser;
  if (!user || !isAdminOwnerUid(user.uid)) {
    setRosterMsg("Sign in again as admin.", true);
    return;
  }
  const key = normEmployeeIdForRoster(employeeIdRaw);
  if (!key) {
    setRosterMsg("Invalid employee ID.", true);
    return;
  }
  setRosterMsg("Saving…");
  try {
    const idToken = await user.getIdToken();
    await postRosterUpsert({ employeeId: employeeIdRaw, workerName, pin }, idToken);
    setRosterMsg("Worker saved.");
    const pinEl = document.getElementById("rosterPin");
    if (pinEl) pinEl.value = "";
  } catch (err) {
    console.error(err);
    setRosterMsg(err?.message || "Save failed. Use the same host as /api (e.g. Vercel or npm run preview).", true);
  }
});

function clearAdminTables() {
  if (timesheetRows) timesheetRows.innerHTML = "";
  if (claimRows) claimRows.innerHTML = "";
}

/** @param {import("firebase/auth").User | null} user */
async function handleAuthUser(user) {
  if (!isConfigReady()) {
    if (authStatus) authStatus.textContent = "Add your Firebase config to firebase-config.js to enable admin.";
    showAuthGate();
    return;
  }
  if (authStatus) authStatus.textContent = "";

  if (!user) {
    stopAdminListeners();
    clearAdminTables();
    showAuthGate();
    setGateError("");
    return;
  }

  const isGoogle = user.providerData?.some((p) => p?.providerId === "google.com");
  if (!user.email || !isGoogle) {
    await signOut(auth);
    setGateError("Admin access requires Google sign-in.");
    return;
  }

  if (!isAdminOwnerUid(user.uid)) {
    await signOut(auth);
    setGateError("This Google account is not registered as an admin for CrewHub.");
    return;
  }

  if (adminSignedInEmail) adminSignedInEmail.textContent = user.email;
  setGateError("");
  hideAuthGate();
  if (!adminListenersStarted) {
    startAdminListeners();
  }
}

async function main() {
  if (location.protocol === "file:" && authStatus) {
    authStatus.textContent =
      "Serve admin over http:// or https:// (not file://) so Google sign-in can run.";
  }
  if (isConfigReady()) {
    try {
      await getRedirectResult(auth);
    } catch (e) {
      console.warn("getRedirectResult", e);
    }
  }
  onAuthStateChanged(auth, (user) => {
    void handleAuthUser(user);
  });
}

main();
