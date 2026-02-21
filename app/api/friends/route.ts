import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { getUserIdentity } from "@/lib/social/server";
import type { FriendRequest, Friendship, UserBlock } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FriendListItem = {
  uid: string;
  displayName: string | null;
  email: string | null;
  lastActiveAt: string | null;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:friends_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const [friendshipsSnap, incomingSnap, outgoingSnap, blocksSnap] =
    await Promise.all([
      adminDb
        .collection("friendships")
        .where("members", "array-contains", user.uid)
        .limit(200)
        .get(),
      adminDb
        .collection("friendRequests")
        .where("toUid", "==", user.uid)
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get(),
      adminDb
        .collection("friendRequests")
        .where("fromUid", "==", user.uid)
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get(),
      adminDb
        .collection("blocks")
        .where("blockerUid", "==", user.uid)
        .limit(200)
        .get()
    ]);

  const friendDocs = friendshipsSnap.docs.map(
    (docSnap) => docSnap.data() as Friendship
  );
  const friendIds = friendDocs
    .map((entry) => entry.members.find((uid) => uid !== user.uid))
    .filter((uid): uid is string => Boolean(uid));

  const friendIdentities = await Promise.all(
    friendIds.map(async (uid) => {
      const identity = await getUserIdentity(uid);
      return {
        uid,
        displayName: identity.displayName,
        email: identity.email,
        lastActiveAt: identity.lastActiveAt
      } as FriendListItem;
    })
  );

  const incomingRequests = incomingSnap.docs.map(
    (docSnap) => docSnap.data() as FriendRequest
  );
  const outgoingRequests = outgoingSnap.docs.map(
    (docSnap) => docSnap.data() as FriendRequest
  );
  const blocks = blocksSnap.docs.map((docSnap) => docSnap.data() as UserBlock);

  return NextResponse.json({
    friends: friendIdentities,
    incomingRequests,
    outgoingRequests,
    blocks
  });
}
