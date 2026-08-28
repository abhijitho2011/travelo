/**
 * Firebase web SDK, loaded lazily and only in the browser.
 *
 * The admin portal uses Firebase for one thing: proving to the backend which
 * Google account the operator controls. The backend re-verifies the ID token
 * server-side and checks it against its own allowlist, so nothing here is a
 * security boundary — these values are public web config by design.
 */

const firebaseConfig = {
  apiKey:
    (import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined) ??
    "AIzaSyDTyOc2-jyPMirqGEzm_IKdsD05bYPY2N4",
  authDomain:
    (import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] as string | undefined) ??
    "tavelo-c4669.firebaseapp.com",
  projectId: (import.meta.env["VITE_FIREBASE_PROJECT_ID"] as string | undefined) ?? "tavelo-c4669",
  storageBucket:
    (import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] as string | undefined) ??
    "tavelo-c4669.firebasestorage.app",
  messagingSenderId:
    (import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] as string | undefined) ?? "754494069859",
  appId:
    (import.meta.env["VITE_FIREBASE_APP_ID"] as string | undefined) ??
    "1:754494069859:web:66edfe94fdba8e6e762c56",
};

/**
 * Opens the Google account chooser and returns a fresh Firebase ID token.
 * Throws when the popup is dismissed or blocked.
 */
export async function signInWithGoogleIdToken(): Promise<string> {
  if (typeof window === "undefined")
    throw new Error("Google sign-in is only available in the browser.");

  const [{ getApps, initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup }] =
    await Promise.all([import("firebase/app"), import("firebase/auth")]);

  const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  // Always let the operator pick the account rather than silently reusing one.
  provider.setCustomParameters({ prompt: "select_account" });

  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken(true);
}
