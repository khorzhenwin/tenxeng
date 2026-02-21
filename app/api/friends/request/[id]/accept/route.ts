import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { friendshipIdForUsers } from "@/lib/social/server";
import type { FriendRequest, Friendship } from "@/lib/social/types";
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

  const limiter = consumeRateLimit(`${user.uid}:friends_request_accept`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const requestRef = adminDb.collection("friendRequests").doc(id);
  const now = new Date().toISOString();

  try {
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(requestRef);
      if (!snap.exists) {
        throw new Error("NOT_FOUND");
      }
      const requestData = snap.data() as FriendRequest;
      if (requestData.toUid !== user.uid) {
        throw new Error("FORBIDDEN");
      }
      if (requestData.status !== "pending") {
        throw new Error("INVALID_STATUS");
      }

      const friendshipId = friendshipIdForUsers(
        requestData.fromUid,
        requestData.toUid
      );
      const friendshipRef = adminDb.collection("friendships").doc(friendshipId);
      const friendship: Friendship = {
        id: friendshipId,
        members: [requestData.fromUid, requestData.toUid].sort(),
        createdAt: now,
        createdBy: user.uid
      };

      tx.set(
        requestRef,
        {
          status: "accepted",
          respondedAt: now,
          updatedAt: now
        },
        { merge: true }
      );
      tx.set(friendshipRef, friendship);
      return { friendshipId, fromUid: requestData.fromUid };
    });
    await createSocialNotification({
      uid: result.fromUid,
      type: "friend_request_accepted",
      title: "Friend request accepted",
      body: "Your friend request was accepted.",
      actorUid: user.uid,
      entityId: id
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Request not found." }, { status: 404 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.message === "INVALID_STATUS") {
        return NextResponse.json(
          { error: "Request is no longer pending." },
          { status: 409 }
        );
      }
    }
    return NextResponse.json(
      { error: "Unable to accept friend request." },
      { status: 500 }
    );
  }
}
