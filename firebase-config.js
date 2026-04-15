/**
 * Firebase web app config (Project settings → Your apps → Web SDK).
 * Worker PIN login uses /api/* on the server with a separate service account — see .env.example.
 *
 * Required for Storage uploads (driver receipts, etc.): Authentication → Sign-in method → Anonymous
 * must be enabled. `storage.rules` only allows `fleet_claims/**` when `request.auth != null`.
 * If you see `auth/admin-restricted-operation`, Anonymous is off or the web API key is restricted
 * (Google Cloud → APIs & Services → Credentials → allow Identity Toolkit API for this key).
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDovmjClkov6q1qRQkkgCExH31rEbX0X2M",
  authDomain: "crewhub-43647.firebaseapp.com",
  projectId: "crewhub-43647",
  storageBucket: "crewhub-43647.firebasestorage.app",
  messagingSenderId: "847443127747",
  appId: "1:847443127747:web:63f307e97063e2c413a176",
  measurementId: "G-P5PXFJT111",
};
