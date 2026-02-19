import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { PvpSession, PvpSessionHistoryEntry } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  selectedAnswers: z.record(z.string(), z.number().int().min(0)),
  timeTakenSeconds: z.number().min(0),
});

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function resolveWinner(
  firstUid: string,
  secondUid: string,
  session: PvpSession
): { winnerUid: string | null; winnerReason: "score" | "time" | "tie" } {
  const first = session.players[firstUid];
  const second = session.players[secondUid];
  const firstScore = Number(first?.score ?? 0);
  const secondScore = Number(second?.score ?? 0);
  if (firstScore > secondScore) {
    return { winnerUid: firstUid, winnerReason: "score" };
  }
  if (secondScore > firstScore) {
    return { winnerUid: secondUid, winnerReason: "score" };
  }

  const firstTime = Number(first?.timeTakenSeconds ?? Number.POSITIVE_INFINITY);
  const secondTime = Number(
    second?.timeTakenSeconds ?? Number.POSITIVE_INFINITY
  );
  if (firstTime < secondTime) {
    return { winnerUid: firstUid, winnerReason: "time" };
  }
  if (secondTime < firstTime) {
    return { winnerUid: secondUid, winnerReason: "time" };
  }

  return { winnerUid: null, winnerReason: "tie" };
}

function buildHistoryEntry(
  session: PvpSession,
  myUid: string,
  opponentUid: string,
  completedAt: string
): PvpSessionHistoryEntry {
  const me = session.players[myUid];
  const opponent = session.players[opponentUid];
  const isDraw = !session.winnerUid;
  const outcome = isDraw
    ? "draw"
    : session.winnerUid === myUid
    ? "win"
    : "loss";

  return {
    sessionId: session.id,
    opponentUid,
    opponentDisplayName: opponent?.displayName ?? null,
    opponentEmail: opponent?.email ?? null,
    myScore: Number(me?.score ?? 0),
    myTotal: Number(me?.total ?? session.questions.length),
    myTimeTakenSeconds: Number(me?.timeTakenSeconds ?? 0),
    opponentScore: Number(opponent?.score ?? 0),
    opponentTotal: Number(opponent?.total ?? session.questions.length),
    opponentTimeTakenSeconds: Number(opponent?.timeTakenSeconds ?? 0),
    winnerUid: session.winnerUid ?? null,
    winnerReason: session.winnerReason ?? "tie",
    outcome,
    completedAt,
  };
}

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
      const score = current.questions.filter(
        (question) =>
          payload.selectedAnswers[question.id] === question.answerIndex
      ).length;
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
          buildHistoryEntry(completedSession, firstUid, secondUid, now)
        );
        tx.set(
          secondHistoryRef,
          buildHistoryEntry(completedSession, secondUid, firstUid, now)
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
