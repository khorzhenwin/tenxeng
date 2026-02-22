import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { AsyncPvpMatch, PvpSession } from "@/lib/pvp/types";
import {
  buildHistoryEntry,
  computeScore,
  resolveWinner,
} from "@/lib/pvp/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  selectedAnswers: z.record(z.string(), z.number().int().min(0)),
  timeTakenSeconds: z.number().min(0)
});

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = submitSchema.parse(await request.json());
  const { matchId } = await context.params;
  const matchRef = adminDb.collection("asyncPvpMatches").doc(matchId);
  const now = new Date().toISOString();

  try {
    const match = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists) {
        throw new Error("NOT_FOUND");
      }
      const current = snap.data() as AsyncPvpMatch;
      if (!current.participantIds.includes(user.uid)) {
        throw new Error("FORBIDDEN");
      }
      if (current.status === "completed" || current.status === "expired") {
        throw new Error("MATCH_CLOSED");
      }

      const total = current.questions.length;
      const score = computeScore(current.questions, payload.selectedAnswers);
      const existingPlayer = current.players[user.uid];
      const updatedPlayers = {
        ...current.players,
        [user.uid]: {
          ...existingPlayer,
          startedAt: existingPlayer?.startedAt ?? now,
          selectedAnswers: payload.selectedAnswers,
          score,
          total,
          timeTakenSeconds: payload.timeTakenSeconds,
          submittedAt: now
        }
      };

      const firstUid = current.participantIds[0];
      const secondUid = current.participantIds[1];
      const firstDone = !!updatedPlayers[firstUid]?.submittedAt;
      const secondDone = !!updatedPlayers[secondUid]?.submittedAt;
      const bothDone = firstDone && secondDone;

      if (!bothDone) {
        const next: Partial<AsyncPvpMatch> = {
          players: updatedPlayers,
          status: "awaiting_opponent"
        };
        tx.set(matchRef, next, { merge: true });
        return { ...current, ...next };
      }

      const winner = resolveWinner(firstUid, secondUid, {
        ...current,
        players: updatedPlayers
      });
      const completedMatch: Partial<AsyncPvpMatch> = {
        players: updatedPlayers,
        status: "completed",
        completedAt: now,
        winnerUid: winner.winnerUid,
        winnerReason: winner.winnerReason
      };
      tx.set(matchRef, completedMatch, { merge: true });

      const merged = { ...current, ...completedMatch } as AsyncPvpMatch;
      const asSessionLike: PvpSession = {
        id: merged.id,
        status: "completed",
        createdBy: merged.createdBy,
        createdAt: merged.createdAt,
        participantIds: merged.participantIds,
        players: merged.players,
        questions: merged.questions,
        completedAt: merged.completedAt,
        winnerUid: merged.winnerUid,
        winnerReason: merged.winnerReason
      };

      const firstUserRef = adminDb.collection("users").doc(firstUid);
      const secondUserRef = adminDb.collection("users").doc(secondUid);
      tx.set(
        firstUserRef.collection("pvpSessionHistory").doc(merged.id),
        buildHistoryEntry(asSessionLike, firstUid, secondUid, now, "async")
      );
      tx.set(
        secondUserRef.collection("pvpSessionHistory").doc(merged.id),
        buildHistoryEntry(asSessionLike, secondUid, firstUid, now, "async")
      );
      return merged;
    });

    return NextResponse.json({ match });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Match not found." }, { status: 404 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.message === "MATCH_CLOSED") {
        return NextResponse.json(
          { error: "Match is already closed." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: "Unable to submit async match." },
      { status: 500 }
    );
  }
}
