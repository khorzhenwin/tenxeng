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
import type { FriendRequest } from "@/lib/social/types";
import { createSocialNotification } from "@/lib/social/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendFriendRequestSchema = z.object({
  targetUid: z.string().min(1)
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:friends_request_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const payload = sendFriendRequestSchema.parse(await request.json());
  const targetUid = payload.targetUid.trim();

  if (targetUid === user.uid) {
    return NextResponse.json(
      { error: "You cannot send a friend request to yourself." },
      { status: 400 }
    );
  }

  const [alreadyFriends, blocked] = await Promise.all([
    usersAreFriends(user.uid, targetUid),
    hasBlockRelationship(user.uid, targetUid)
  ]);
  if (blocked) {
    return NextResponse.json(
      { error: "Unable to send request due to block settings." },
      { status: 403 }
    );
  }
  if (alreadyFriends) {
    return NextResponse.json({ error: "You are already friends." }, { status: 409 });
  }

  const [existingOutgoing, existingIncoming] = await Promise.all([
    adminDb
      .collection("friendRequests")
      .where("status", "==", "pending")
      .where("fromUid", "==", user.uid)
      .where("toUid", "==", targetUid)
      .limit(1)
      .get(),
    adminDb
      .collection("friendRequests")
      .where("status", "==", "pending")
      .where("fromUid", "==", targetUid)
      .where("toUid", "==", user.uid)
      .limit(1)
      .get()
  ]);
  if (!existingOutgoing.empty || !existingIncoming.empty) {
    return NextResponse.json(
      { error: "There is already a pending friend request between both users." },
      { status: 409 }
    );
  }

  const [fromUser, toUser, targetUserSnap] = await Promise.all([
    getUserIdentity(user.uid),
    getUserIdentity(targetUid),
    adminDb.collection("users").doc(targetUid).get()
  ]);
  if (!targetUserSnap.exists) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const requestRef = adminDb.collection("friendRequests").doc();
  const friendRequest: FriendRequest = {
    id: requestRef.id,
    fromUid: user.uid,
    toUid: targetUid,
    fromDisplayName: fromUser.displayName,
    fromEmail: fromUser.email,
    toDisplayName: toUser.displayName,
    toEmail: toUser.email,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    respondedAt: null,
    expiresAt
  };
  await requestRef.set(friendRequest);
  await createSocialNotification({
    uid: targetUid,
    type: "friend_request",
    title: "New friend request",
    body: `${fromUser.displayName ?? fromUser.email ?? "A user"} sent you a friend request.`,
    actorUid: user.uid,
    entityId: friendRequest.id
  });

  return NextResponse.json({ request: friendRequest }, { status: 201 });
}
