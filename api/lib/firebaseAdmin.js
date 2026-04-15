import "./loadEnv.js";
import admin from "firebase-admin";

let app;

/** @returns {import("firebase-admin").app.App} */
export function getFirebaseApp() {
  if (app) return app;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (privateKey?.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY. " +
        "For local preview (`npm run preview`): add them to `.env.local` in the repo root (from a Firebase service account JSON), " +
        "or run `vercel env pull`. On Vercel production: Project Settings → Environment Variables."
    );
  }
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    `${projectId}.firebasestorage.app`;

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket,
  });
  return app;
}

export function getDb() {
  getFirebaseApp();
  return admin.firestore();
}

/** @returns {import("firebase-admin").auth.Auth} */
export function getAuthAdmin() {
  getFirebaseApp();
  return admin.auth();
}
