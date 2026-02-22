import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { PvpSession } from "@/lib/pvp/types";
import {
  buildHistoryEntry,
  computeScore,
  resolveWinner,
} from "@/lib/pvp/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  selectedAnswers: z.record(z.string(), z.number().int().min(0)),
  timeTakenSeconds: z.number().min(0),
});

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = submitSchema.parse(await request.json());
  const { sessionId } = await context.params;
  const sessionRef = adminDb.collection("pvpSessions").doc(sessionId);
  const now = new Date().toISOString();

  try {
    const session = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists) {
        throw new Error("NOT_FOUND");
      }
      const current = snap.data() as PvpSession;
      if (!current.participantIds.includes(user.uid)) {
        throw new Error("FORBIDDEN");
      }
      if (current.status === "waiting" || current.status === "ready") {
        throw new Error("NOT_STARTED");
      }

      const total = current.questions.length;
      const score = computeScore(current.questions, payload.selectedAnswers);
      const existingPlayer = current.players[user.uid];
      const updatedPlayers = {
        ...current.players,
        [user.uid]: {
          ...existingPlayer,
          selectedAnswers: payload.selectedAnswers,
          score,
          total,
          timeTakenSeconds: payload.timeTakenSeconds,
          submittedAt: now,
        },
      };

      const firstUid = current.participantIds[0];
      const secondUid = current.participantIds[1];
      const firstDone = !!updatedPlayers[firstUid]?.submittedAt;
      const secondDone = !!updatedPlayers[secondUid]?.submittedAt;
      const bothDone = firstDone && secondDone;

      if (bothDone) {
        const winner = resolveWinner(firstUid, secondUid, {
          ...current,
          players: updatedPlayers,
        });
        const nextSession: Partial<PvpSession> = {
          players: updatedPlayers,
          status: "completed",
          completedAt: now,
          winnerUid: winner.winnerUid,
          winnerReason: winner.winnerReason,
        };
        tx.set(sessionRef, nextSession, { merge: true });
        const completedSession = { ...current, ...nextSession };
        const firstUserRef = adminDb.collection("users").doc(firstUid);
        const secondUserRef = adminDb.collection("users").doc(secondUid);
        const firstHistoryRef = firstUserRef
          .collection("pvpSessionHistory")
          .doc(current.id);
        const secondHistoryRef = secondUserRef
          .collection("pvpSessionHistory")
          .doc(current.id);
        tx.set(
          firstHistoryRef,
          buildHistoryEntry(completedSession, firstUid, secondUid, now, "sync")
        );
        tx.set(
          secondHistoryRef,
          buildHistoryEntry(completedSession, secondUid, firstUid, now, "sync")
        );
        tx.set(firstUserRef, { activePvpSessionId: null }, { merge: true });
        tx.set(secondUserRef, { activePvpSessionId: null }, { merge: true });
        return completedSession;
      }

      const nextSession: Partial<PvpSession> = {
        players: updatedPlayers,
      };
      tx.set(sessionRef, nextSession, { merge: true });
      return { ...current, ...nextSession };
    });

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.message === "NOT_STARTED") {
        return NextResponse.json(
          { error: "Session has not started yet." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: "Unable to submit answers." },
      { status: 500 }
    );
  }
}
