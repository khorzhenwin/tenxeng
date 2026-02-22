import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { AsyncPvpInboxEntry, AsyncPvpMatch } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:pvp_async_inbox_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const snap = await adminDb
    .collection("asyncPvpMatches")
    .where("participantIds", "array-contains", user.uid)
    .where("status", "in", ["open", "awaiting_opponent", "completed"])
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const matches: AsyncPvpInboxEntry[] = snap.docs.map((docSnap) => {
    const match = docSnap.data() as AsyncPvpMatch;
    const opponentUid =
      match.participantIds.find((participantId) => participantId !== user.uid) ?? null;
    const opponent = opponentUid ? match.players[opponentUid] : null;
    return {
      id: match.id,
      challengeId: match.challengeId,
      status: match.status,
      createdAt: match.createdAt,
      expiresAt: match.expiresAt,
      opponentUid,
      opponentDisplayName: opponent?.displayName ?? null,
      opponentEmail: opponent?.email ?? null,
      mySubmitted: Boolean(match.players[user.uid]?.submittedAt),
      opponentSubmitted: opponentUid
        ? Boolean(match.players[opponentUid]?.submittedAt)
        : false,
      winnerUid: match.winnerUid ?? null
    };
  });

  return NextResponse.json({ matches });
}
