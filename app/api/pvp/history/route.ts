import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { PvpSession, PvpSessionHistoryEntry } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const historyRef = adminDb
    .collection("users")
    .doc(user.uid)
    .collection("pvpSessionHistory");
  const sessionsRef = adminDb.collection("pvpSessions");

  try {
    const [historySnap, sessionSnap] = await Promise.all([
      historyRef.orderBy("completedAt", "desc").get(),
      sessionsRef
        .where("participantIds", "array-contains", user.uid)
        .where("status", "==", "completed")
        .orderBy("completedAt", "desc")
        .get(),
    ]);

    const historyMap = new Map<string, PvpSessionHistoryEntry>();
    historySnap.docs.forEach((docSnap) => {
      const entry = docSnap.data() as PvpSessionHistoryEntry;
      historyMap.set(docSnap.id, {
        ...entry,
        sessionId: entry.sessionId ?? docSnap.id,
        matchType: entry.matchType ?? "sync",
        winnerReason: entry.winnerReason ?? "tie",
      });
    });

    sessionSnap.docs.forEach((docSnap) => {
      if (historyMap.has(docSnap.id)) return;
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
      historyMap.set(docSnap.id, {
        sessionId: docSnap.id,
        matchType: "sync",
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
      });
    });

    const history = Array.from(historyMap.values()).sort(
      (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
    );
    return NextResponse.json({ history, nextCursor: null, hasMore: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load PvP history.";
    return NextResponse.json(
      { error: message || "Unable to load PvP history." },
      { status: 500 }
    );
  }
}
