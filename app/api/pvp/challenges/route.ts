import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import {
  getUserIdentity,
  hasBlockRelationship,
  usersAreFriends
} from "@/lib/social/server";
import type { PvpChallenge } from "@/lib/social/types";
import { createSocialNotification } from "@/lib/social/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createChallengeSchema = z.object({
  challengedUid: z.string().min(1)
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:pvp_challenge_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const payload = createChallengeSchema.parse(await request.json());
  const challengedUid = payload.challengedUid.trim();
  if (challengedUid === user.uid) {
    return NextResponse.json(
      { error: "You cannot challenge yourself." },
      { status: 400 }
    );
  }

  const [friends, blocked] = await Promise.all([
    usersAreFriends(user.uid, challengedUid),
    hasBlockRelationship(user.uid, challengedUid)
  ]);
  if (!friends) {
    return NextResponse.json(
      { error: "You can only challenge users in your friend list." },
      { status: 403 }
    );
  }
  if (blocked) {
    return NextResponse.json(
      { error: "Unable to challenge due to block settings." },
      { status: 403 }
    );
  }

  const pendingSnap = await adminDb
    .collection("pvpChallenges")
    .where("status", "==", "pending")
    .where("challengerUid", "in", [user.uid, challengedUid])
    .limit(20)
    .get();
  const hasPending = pendingSnap.docs.some((docSnap) => {
    const data = docSnap.data() as PvpChallenge;
    return (
      (data.challengerUid === user.uid && data.challengedUid === challengedUid) ||
      (data.challengerUid === challengedUid && data.challengedUid === user.uid)
    );
  });
  if (hasPending) {
    return NextResponse.json(
      { error: "There is already a pending challenge between both users." },
      { status: 409 }
    );
  }

  const [challengerIdentity, challengedIdentity] = await Promise.all([
    getUserIdentity(user.uid),
    getUserIdentity(challengedUid)
  ]);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const challengeRef = adminDb.collection("pvpChallenges").doc();
  const challenge: PvpChallenge = {
    id: challengeRef.id,
    challengerUid: user.uid,
    challengedUid,
    challengerDisplayName: challengerIdentity.displayName,
    challengedDisplayName: challengedIdentity.displayName,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    respondedAt: null,
    expiresAt,
    pvpSessionId: null
  };
  await challengeRef.set(challenge);
  await createSocialNotification({
    uid: challengedUid,
    type: "pvp_challenge",
    title: "New PvP challenge",
    body: `${challengerIdentity.displayName ?? "A friend"} challenged you to PvP.`,
    actorUid: user.uid,
    entityId: challenge.id
  });
  return NextResponse.json({ challenge }, { status: 201 });
}
