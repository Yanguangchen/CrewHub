import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-analytics.js";
import {
  getAuth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-storage.js";
import { firebaseConfig } from "../firebase-config.js";

export const app = initializeApp(firebaseConfig);

/** Analytics when the browser supports it (skipped e.g. in some privacy modes). */
export const analyticsPromise = isSupported().then((ok) => (ok ? getAnalytics(app) : null));

export const auth = getAuth(app);

/** Lazy so worker/driver pages never open a Firestore channel (rules deny non-owner reads). */
let _db;
export function getDb() {
  if (!_db) _db = getFirestore(app);
  return _db;
}

export const storage = getStorage(app);

export {
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  updateDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  ref,
  uploadBytes,
  getDownloadURL,
};

export const COL_TIMESHEETS = "timesheets";
export const COL_CLAIMS = "fleet_claims";
export const COL_WORKER_CREDENTIALS = "worker_credentials";

export function isConfigReady() {
  return firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).includes("REPLACE_ME");
}
