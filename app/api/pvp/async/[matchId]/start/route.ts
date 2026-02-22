import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { AsyncPvpMatch } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
        return current;
      }

      const existingPlayer = current.players[user.uid];
      const nextMatch: Partial<AsyncPvpMatch> = {
        players: {
          ...current.players,
          [user.uid]: {
            ...existingPlayer,
            startedAt: existingPlayer?.startedAt ?? now
          }
        }
      };
      tx.set(matchRef, nextMatch, { merge: true });
      return { ...current, ...nextMatch };
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
    }
    return NextResponse.json({ error: "Unable to start match." }, { status: 500 });
  }
}
