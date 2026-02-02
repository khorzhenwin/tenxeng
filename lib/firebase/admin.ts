import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
let privateKey = rawPrivateKey ?? "";

privateKey = privateKey
  .trim()
  .replace(/\\\\r\\\\n/g, "\n")
  .replace(/\\\\n/g, "\n")
  .replace(/\\r\\n/g, "\n")
  .replace(/\\n/g, "\n")
  .replace(/^['"]|['"]$/g, "")
  .trim();

if (privateKey.endsWith(",")) {
  privateKey = privateKey.slice(0, -1);
}

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Missing Firebase admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
  );
}

if (
  !privateKey.includes("BEGIN PRIVATE KEY") ||
  !privateKey.includes("END PRIVATE KEY")
) {
  throw new Error(
    "FIREBASE_PRIVATE_KEY is not a valid PEM. Ensure it includes BEGIN/END PRIVATE KEY and uses \\n for newlines."
  );
}

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      })
    : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
