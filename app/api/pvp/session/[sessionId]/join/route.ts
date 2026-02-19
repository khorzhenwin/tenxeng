import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { PvpPlayer, PvpSession } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const sessionRef = adminDb.collection("pvpSessions").doc(sessionId);
  const userRef = adminDb.collection("users").doc(user.uid);
  const now = new Date().toISOString();

  try {
    const session = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists) {
        throw new Error("NOT_FOUND");
      }

      const data = snap.data() as PvpSession;
      if (data.participantIds.includes(user.uid)) {
        return data;
      }
      if (data.participantIds.length >= 2) {
        throw new Error("FULL");
      }

      const player: PvpPlayer = {
        uid: user.uid,
        displayName: user.name ?? null,
        email: user.email ?? null,
        joinedAt: now,
      };
      const participantIds = [...data.participantIds, user.uid];
      const status = participantIds.length === 2 ? "ready" : "waiting";
      const nextSession: PvpSession = {
        ...data,
        participantIds,
        status,
        players: {
          ...data.players,
          [user.uid]: player,
        },
      };
      tx.set(sessionRef, nextSession, { merge: true });
      return nextSession;
    });

    await userRef.set({ activePvpSessionId: session.id }, { merge: true });
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }
      if (error.message === "FULL") {
        return NextResponse.json(
          { error: "Session already has 2 players." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: "Unable to join session." },
      { status: 500 }
    );
  }
}
