import { randomUUID } from "node:crypto";
import admin from "firebase-admin";
import { getFirebaseApp } from "./firebaseAdmin.js";

/**
 * Writes bytes to the default Storage bucket and returns a Firebase download URL (token style).
 */
export async function saveClaimObject({ folder, kind, buffer, mimeType, originalName }) {
  getFirebaseApp();
  const bucket = admin.storage().bucket();
  const safe = String(originalName || "photo.jpg")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  const objectPath = `fleet_claims/${folder}/${kind}_${safe}`;
  const token = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: mimeType || "application/octet-stream",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const bucketName = bucket.name;
  const enc = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${enc}?alt=media&token=${token}`;
}
