import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { PvpChallenge } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:pvp_challenge_inbox_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const [incomingSnap, outgoingSnap] = await Promise.all([
    adminDb
      .collection("pvpChallenges")
      .where("challengedUid", "==", user.uid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get(),
    adminDb
      .collection("pvpChallenges")
      .where("challengerUid", "==", user.uid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get()
  ]);

  return NextResponse.json({
    incoming: incomingSnap.docs.map((docSnap) => docSnap.data() as PvpChallenge),
    outgoing: outgoingSnap.docs.map((docSnap) => docSnap.data() as PvpChallenge)
  });
}
