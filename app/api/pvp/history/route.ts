import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { PvpSession, PvpSessionHistoryEntry } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = querySchema.parse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });

  const sessionsRef = adminDb.collection("pvpSessions");
  let query = sessionsRef
    .where("participantIds", "array-contains", user.uid)
    .where("status", "==", "completed")
    .orderBy("completedAt", "desc")
    .limit(params.pageSize + 1);
  if (params.cursor) {
    const cursorSnap = await sessionsRef.doc(params.cursor).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  let historySnap;
  try {
    historySnap = await query.get();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Firestore throws failed-precondition when required composite index is missing.
    if (
      message.toLowerCase().includes("failed-precondition") ||
      message.toLowerCase().includes("requires an index")
    ) {
      return NextResponse.json(
        {
          error:
            "PvP history index is still building. Please try again in a minute.",
          code: "INDEX_NOT_READY",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Unable to load PvP history." },
      { status: 500 }
    );
  }

  const hasMore = historySnap.docs.length > params.pageSize;
  const docs = hasMore
    ? historySnap.docs.slice(0, params.pageSize)
    : historySnap.docs;
  const history = docs.map((docSnap) => {
    const session = docSnap.data() as PvpSession;
    const opponentUid =
      session.participantIds.find((participantId) => participantId !== user.uid) ??
      null;
    const me = session.players[user.uid];
    const opponent = opponentUid ? session.players[opponentUid] : undefined;
    const isDraw = !session.winnerUid;
    const outcome = isDraw
      ? "draw"
      : session.winnerUid === user.uid
      ? "win"
      : "loss";

    return {
      sessionId: docSnap.id,
      opponentUid,
      opponentDisplayName: opponent?.displayName ?? null,
      opponentEmail: opponent?.email ?? null,
      myScore: Number(me?.score ?? 0),
      myTotal: Number(me?.total ?? session.questions.length ?? 0),
      myTimeTakenSeconds: Number(me?.timeTakenSeconds ?? 0),
      opponentScore: Number(opponent?.score ?? 0),
      opponentTotal: Number(opponent?.total ?? session.questions.length ?? 0),
      opponentTimeTakenSeconds: Number(opponent?.timeTakenSeconds ?? 0),
      winnerUid: session.winnerUid ?? null,
      winnerReason: session.winnerReason ?? "tie",
      outcome,
      completedAt: session.completedAt ?? session.createdAt,
    } as PvpSessionHistoryEntry;
  });
  const nextCursor = hasMore ? docs[docs.length - 1]?.id ?? null : null;

  return NextResponse.json({ history, nextCursor, hasMore });
}
