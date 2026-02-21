import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { PvpChallenge } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:pvp_challenge_decline`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const challengeRef = adminDb.collection("pvpChallenges").doc(id);
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }
  const challenge = challengeSnap.data() as PvpChallenge;
  if (challenge.challengedUid !== user.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json(
      { error: "Challenge is no longer pending." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  await challengeRef.set(
    {
      status: "declined",
      updatedAt: now,
      respondedAt: now
    },
    { merge: true }
  );
  return NextResponse.json({ success: true });
}
