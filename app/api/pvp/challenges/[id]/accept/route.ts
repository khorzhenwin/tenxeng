import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { getUserIdentity } from "@/lib/social/server";
import type { PvpPlayer, PvpSession } from "@/lib/pvp/types";
import type { PvpChallenge } from "@/lib/social/types";
import { createSocialNotification } from "@/lib/social/notifications";

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
  const limiter = consumeRateLimit(`${user.uid}:pvp_challenge_accept`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const challengeRef = adminDb.collection("pvpChallenges").doc(id);
  const now = new Date().toISOString();

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const challengeSnap = await tx.get(challengeRef);
      if (!challengeSnap.exists) {
        throw new Error("NOT_FOUND");
      }
      const challenge = challengeSnap.data() as PvpChallenge;
      if (challenge.challengedUid !== user.uid) {
        throw new Error("FORBIDDEN");
      }
      if (challenge.status !== "pending") {
        throw new Error("INVALID_STATUS");
      }

      const sessionRef = adminDb.collection("pvpSessions").doc();
      const [challengerIdentity, challengedIdentity] = await Promise.all([
        getUserIdentity(challenge.challengerUid),
        getUserIdentity(challenge.challengedUid)
      ]);
      const challengerPlayer: PvpPlayer = {
        uid: challenge.challengerUid,
        displayName: challengerIdentity.displayName,
        email: challengerIdentity.email,
        joinedAt: now
      };
      const challengedPlayer: PvpPlayer = {
        uid: challenge.challengedUid,
        displayName: challengedIdentity.displayName,
        email: challengedIdentity.email,
        joinedAt: now
      };
      const session: PvpSession = {
        id: sessionRef.id,
        status: "ready",
        createdBy: challenge.challengerUid,
        createdAt: now,
        participantIds: [challenge.challengerUid, challenge.challengedUid],
        players: {
          [challenge.challengerUid]: challengerPlayer,
          [challenge.challengedUid]: challengedPlayer
        },
        questions: []
      };
      tx.set(sessionRef, session);
      tx.set(
        challengeRef,
        {
          status: "accepted",
          updatedAt: now,
          respondedAt: now,
          pvpSessionId: session.id
        },
        { merge: true }
      );
      tx.set(
        adminDb.collection("users").doc(challenge.challengerUid),
        { activePvpSessionId: session.id },
        { merge: true }
      );
      tx.set(
        adminDb.collection("users").doc(challenge.challengedUid),
        { activePvpSessionId: session.id },
        { merge: true }
      );
      return { sessionId: session.id, challengerUid: challenge.challengerUid };
    });
    await createSocialNotification({
      uid: result.challengerUid,
      type: "pvp_challenge_accepted",
      title: "PvP challenge accepted",
      body: "Your challenge was accepted. Match is ready to start.",
      actorUid: user.uid,
      entityId: id
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.message === "INVALID_STATUS") {
        return NextResponse.json(
          { error: "Challenge is no longer pending." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: "Unable to accept challenge." },
      { status: 500 }
    );
  }
}
