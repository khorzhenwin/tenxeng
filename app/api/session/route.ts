import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export const runtime = "nodejs";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

const sessionSchema = z.object({
  idToken: z.string().min(1),
  timezone: z.string().optional(),
});

export async function POST(request: Request) {
  const payload = sessionSchema.parse(await request.json());
  let decodedToken;
  let sessionCookie;

  try {
    decodedToken = await adminAuth.verifyIdToken(payload.idToken);
    sessionCookie = await adminAuth.createSessionCookie(payload.idToken, {
      expiresIn: SESSION_DURATION_MS,
    });
  } catch (error) {
    console.error("Session creation failed:", error);
    if (process.env.NODE_ENV !== "production") {
      const message =
        error instanceof Error ? error.message : "Unauthorized";
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });

  const userRef = adminDb.collection("users").doc(decodedToken.uid);
  await userRef.set(
    {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
      displayName: decodedToken.name ?? null,
      timezone: payload.timezone ?? "UTC",
      lastActiveAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
