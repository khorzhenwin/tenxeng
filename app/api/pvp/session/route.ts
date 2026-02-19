import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { PvpPlayer, PvpSession } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSessionSchema = z.object({});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  createSessionSchema.parse(await request.json().catch(() => ({})));

  const userRef = adminDb.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  const activeSessionId = userSnap.data()?.activePvpSessionId as
    | string
    | undefined;
  if (activeSessionId) {
    const activeSessionRef = adminDb.collection("pvpSessions").doc(activeSessionId);
    const activeSessionSnap = await activeSessionRef.get();
    if (activeSessionSnap.exists) {
      const activeSession = activeSessionSnap.data() as PvpSession;
      if (
        activeSession.participantIds.includes(user.uid) &&
        activeSession.status !== "completed"
      ) {
        return NextResponse.json({
          sessionId: activeSession.id,
          session: activeSession,
        });
      }
    }
    await userRef.set({ activePvpSessionId: null }, { merge: true });
  }

  const existingSessionSnap = await adminDb
    .collection("pvpSessions")
    .where("participantIds", "array-contains", user.uid)
    .limit(10)
    .get();
  const reusableSession = existingSessionSnap.docs
    .map((docSnap) => docSnap.data() as PvpSession)
    .filter((entry) => entry.status !== "completed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (reusableSession) {
    await userRef.set(
      { activePvpSessionId: reusableSession.id },
      { merge: true }
    );
    return NextResponse.json({
      sessionId: reusableSession.id,
      session: reusableSession,
    });
  }

  const now = new Date().toISOString();
  const player: PvpPlayer = {
    uid: user.uid,
    displayName: user.name ?? null,
    email: user.email ?? null,
    joinedAt: now,
  };

  const sessionRef = adminDb.collection("pvpSessions").doc();
  const session: PvpSession = {
    id: sessionRef.id,
    status: "waiting",
    createdBy: user.uid,
    createdAt: now,
    participantIds: [user.uid],
    players: {
      [user.uid]: player,
    },
    questions: [],
  };

  await sessionRef.set(session);
  await userRef.set({ activePvpSessionId: session.id }, { merge: true });

  return NextResponse.json({
    sessionId: sessionRef.id,
    session,
  });
}
