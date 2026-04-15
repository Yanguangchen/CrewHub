import { isConfigReady } from "./firebase-client.js";
import { setText, showMessage } from "./crewhub-helpers.js";
import { bootstrapAuth } from "./crewhub-auth.js";
import { initThemePicker, wireFileMeta } from "./ui.js";
import { sanitizePin, bindPinInput } from "./crewhub-identity.js";
import { postLogin, postLogout, getSession, postDriverClaim } from "./api-worker.js";

const STEP_LOGIN = 1;
const STEP_DEST = 2;
const STEP_MILEAGE = 3;
const STEP_RECEIPT = 4;
const STEP_METER = 5;

/** Raw bytes per photo; JSON base64 stays under Vercel’s ~4.5 MB body limit. */
const MAX_CLAIM_IMAGE_BYTES = Math.floor(1.55 * 1024 * 1024);

/**
 * @param {File} file
 * @returns {Promise<{ base64: string, mimeType: string, name: string }>}
 */
function fileToBase64Part(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string" || !r.startsWith("data:")) {
        reject(new Error("Could not read image"));
        return;
      }
      const comma = r.indexOf(",");
      const head = r.slice(0, comma);
      const base64 = r.slice(comma + 1);
      const mimeMatch = /^data:([^;,]+)/i.exec(head);
      const mimeType = mimeMatch?.[1]?.trim() || file.type || "image/jpeg";
      resolve({ base64, mimeType, name: file.name || "photo.jpg" });
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

initThemePicker();
bootstrapAuth();

const driverLoginScreen = document.getElementById("driverLoginScreen");
const driverDestScreen = document.getElementById("driverDestScreen");
const driverMileageScreen = document.getElementById("driverMileageScreen");
const driverReceiptScreen = document.getElementById("driverReceiptScreen");
const driverMeterScreen = document.getElementById("driverMeterScreen");
const driverSignedInBar = document.getElementById("driverSignedInBar");
const driverWelcomeName = document.getElementById("driverWelcomeName");

const fileReceipt = document.getElementById("fileReceipt");
const fileMeter = document.getElementById("fileMeter");
const destinationEl = document.getElementById("destination");
const mileageEl = document.getElementById("mileage");
const driverPin = document.getElementById("driverPin");
const driverEmployeeId = document.getElementById("driverEmployeeId");
const driverLoginForm = document.getElementById("driverLoginForm");
const driverLoginMessage = document.getElementById("driverLoginMessage");

let sessionWorkerName = "";
let sessionEmployeeId = "";

bindPinInput(driverPin);

wireFileMeta(fileReceipt, document.getElementById("receiptFileName"));
wireFileMeta(fileMeter, document.getElementById("meterFileName"));

function setLoginMessage(text, isError = false) {
  if (!driverLoginMessage) return;
  driverLoginMessage.textContent = text;
  driverLoginMessage.classList.toggle("is-error", isError);
}

function showPanel(el, visible) {
  if (!el) return;
  el.classList.toggle("is-hidden", !visible);
  el.hidden = !visible;
}

function syncSignedInBar() {
  if (driverWelcomeName) driverWelcomeName.textContent = sessionWorkerName || "—";
  const on = !!sessionWorkerName;
  showPanel(driverSignedInBar, on);
}

/** @param {typeof STEP_LOGIN | typeof STEP_DEST | typeof STEP_MILEAGE | typeof STEP_RECEIPT | typeof STEP_METER} step */
function showDriverStep(step) {
  showPanel(driverLoginScreen, step === STEP_LOGIN);
  showPanel(driverDestScreen, step === STEP_DEST);
  showPanel(driverMileageScreen, step === STEP_MILEAGE);
  showPanel(driverReceiptScreen, step === STEP_RECEIPT);
  showPanel(driverMeterScreen, step === STEP_METER);
  syncSignedInBar();
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle("is-loading", loading);
  btn.setAttribute("aria-busy", loading ? "true" : "false");
}

function clearClaimFields() {
  if (destinationEl) destinationEl.value = "";
  if (mileageEl) mileageEl.value = "";
  if (fileReceipt) fileReceipt.value = "";
  if (fileMeter) fileMeter.value = "";
  setText("receiptFileName", "No file selected");
  setText("meterFileName", "No file selected");
}

async function applySessionFromServer() {
  try {
    const s = await getSession();
    if (s?.workerName) {
      sessionWorkerName = s.workerName;
      sessionEmployeeId = s.employeeId || "";
      return true;
    }
  } catch (e) {
    console.warn("session check", e);
  }
  sessionWorkerName = "";
  sessionEmployeeId = "";
  return false;
}

function resetAfterSignOut() {
  sessionWorkerName = "";
  sessionEmployeeId = "";
  if (driverPin) driverPin.value = "";
  if (driverEmployeeId) driverEmployeeId.value = "";
  setLoginMessage("");
  showMessage("driverMessage", "");
  clearClaimFields();
  showDriverStep(STEP_LOGIN);
}

driverLoginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoginMessage("");
  const employeeId = driverEmployeeId?.value?.trim() || "";
  const pin = sanitizePin(driverPin?.value || "");
  if (!employeeId) {
    setLoginMessage("Enter your phone number or employee ID.", true);
    driverEmployeeId?.focus();
    return;
  }
  if (pin.length !== 6) {
    setLoginMessage("PIN must be exactly 6 digits.", true);
    driverPin?.focus();
    return;
  }

  const btn = document.getElementById("driverLoginSubmit");
  setBtnLoading(btn, true);
  try {
    const data = await postLogin({ employeeId, pin });
    sessionWorkerName = data.workerName || "";
    sessionEmployeeId = data.employeeId || employeeId;
    if (!sessionWorkerName) {
      throw new Error("Server did not return your name.");
    }
    if (driverPin) driverPin.value = "";
    showDriverStep(STEP_DEST);
    destinationEl?.focus();
  } catch (err) {
    console.error(err);
    setLoginMessage(err.message || "Login failed.", true);
  } finally {
    setBtnLoading(btn, false);
  }
});

document.getElementById("btnDriverDestNext")?.addEventListener("click", () => {
  showMessage("driverMessage", "");
  const destination = destinationEl?.value.trim() || "";
  if (!destination) {
    showMessage("driverMessage", "Enter a destination or job.", true);
    destinationEl?.focus();
    return;
  }
  showDriverStep(STEP_MILEAGE);
  mileageEl?.focus();
});

document.getElementById("btnDriverMileageNext")?.addEventListener("click", () => {
  showMessage("driverMessage", "");
  const mileageRaw = mileageEl?.value ?? "";
  if (mileageRaw === "" || Number.isNaN(Number(mileageRaw))) {
    showMessage("driverMessage", "Enter a valid mileage.", true);
    mileageEl?.focus();
    return;
  }
  showDriverStep(STEP_RECEIPT);
});

document.getElementById("btnDriverReceiptNext")?.addEventListener("click", () => {
  showMessage("driverMessage", "");
  const receipt = fileReceipt?.files?.[0];
  if (!receipt) {
    showMessage("driverMessage", "Add a fuel receipt photo to continue.", true);
    return;
  }
  showDriverStep(STEP_METER);
});

document.getElementById("btnDriverBackFromDest")?.addEventListener("click", async () => {
  try {
    await postLogout();
  } catch (e) {
    console.error(e);
  }
  resetAfterSignOut();
});

document.getElementById("btnDriverBackFromMileage")?.addEventListener("click", () => {
  showMessage("driverMessage", "");
  showDriverStep(STEP_DEST);
});

document.getElementById("btnDriverBackFromReceipt")?.addEventListener("click", () => {
  showMessage("driverMessage", "");
  showDriverStep(STEP_MILEAGE);
});

document.getElementById("btnDriverBackFromMeter")?.addEventListener("click", () => {
  showMessage("driverMessage", "");
  showDriverStep(STEP_RECEIPT);
});

document.getElementById("btnDriverSignOut")?.addEventListener("click", async () => {
  try {
    await postLogout();
  } catch (e) {
    console.error(e);
  }
  resetAfterSignOut();
});

document.getElementById("btnSubmitClaim")?.addEventListener("click", async () => {
  showMessage("driverMessage", "");
  if (!isConfigReady()) {
    showMessage("driverMessage", "Set firebase-config.js to your project values first.", true);
    return;
  }
  if (!sessionWorkerName) {
    showMessage("driverMessage", "Please sign in again.", true);
    showDriverStep(STEP_LOGIN);
    return;
  }

  const destination = destinationEl?.value.trim() || "";
  const mileageRaw = mileageEl?.value ?? "";
  const receipt = fileReceipt?.files?.[0];
  const meter = fileMeter?.files?.[0];

  if (!destination) {
    showMessage("driverMessage", "Go back and enter a destination.", true);
    showDriverStep(STEP_DEST);
    return;
  }
  if (mileageRaw === "" || Number.isNaN(Number(mileageRaw))) {
    showMessage("driverMessage", "Go back and enter mileage.", true);
    showDriverStep(STEP_MILEAGE);
    return;
  }
  if (!receipt) {
    showMessage("driverMessage", "Add a fuel receipt photo.", true);
    showDriverStep(STEP_RECEIPT);
    return;
  }
  if (!meter) {
    showMessage("driverMessage", "Add a mileage meter photo.", true);
    return;
  }

  const mileage = Number(mileageRaw);

  if (receipt.size > MAX_CLAIM_IMAGE_BYTES || meter.size > MAX_CLAIM_IMAGE_BYTES) {
    showMessage(
      "driverMessage",
      "Each photo must be under about 1.5 MB (phone “most compatible” or resize). Try again with smaller images.",
      true
    );
    return;
  }

  const submitBtn = document.getElementById("btnSubmitClaim");
  setBtnLoading(submitBtn, true);
  try {
    showMessage("driverMessage", "Uploading…");
    const [receiptPart, meterPart] = await Promise.all([fileToBase64Part(receipt), fileToBase64Part(meter)]);
    await postDriverClaim({
      destination,
      mileage,
      receiptBase64: receiptPart.base64,
      receiptMime: receiptPart.mimeType,
      receiptName: receiptPart.name,
      meterBase64: meterPart.base64,
      meterMime: meterPart.mimeType,
      meterName: meterPart.name,
    });

    clearClaimFields();
    showMessage("driverMessage", "Claim submitted.");
    showDriverStep(STEP_DEST);
  } catch (e) {
    console.error(e);
    showMessage("driverMessage", e.message || "Submit failed.", true);
  } finally {
    setBtnLoading(submitBtn, false);
  }
});

async function initDriverPage() {
  const ok = await applySessionFromServer();
  if (ok) {
    showDriverStep(STEP_DEST);
  } else {
    showDriverStep(STEP_LOGIN);
  }
}

void initDriverPage();
