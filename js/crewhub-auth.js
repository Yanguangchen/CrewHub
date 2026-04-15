import { auth, signInAnonymously, onAuthStateChanged, isConfigReady } from "./firebase-client.js";
import { setText } from "./crewhub-helpers.js";

/**
 * @param {{ onSignedIn?: () => void }} | undefined} options
 */
export function bootstrapAuth(options = {}) {
  const { onSignedIn } = options;
  const authStatus = document.getElementById("authStatus");

  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (authStatus) setText("authStatus", "Connected (signed in anonymously).");
      onSignedIn?.();
    } else if (authStatus) {
      setText("authStatus", "Not signed in.");
    }
  });

  if (isConfigReady()) {
    signInAnonymously(auth).catch((e) => {
      console.error(e);
      let msg = e?.message || "Auth error";
      if (e?.code === "auth/admin-restricted-operation" || e?.code === "auth/operation-not-allowed") {
        msg =
          "Anonymous sign-in is disabled in Firebase. Console → Authentication → Sign-in method → enable Anonymous.";
      }
      if (authStatus) setText("authStatus", `Auth error: ${msg}`);
    });
  } else if (authStatus) {
    setText("authStatus", "Add your Firebase config to firebase-config.js to enable sync.");
  }
}
