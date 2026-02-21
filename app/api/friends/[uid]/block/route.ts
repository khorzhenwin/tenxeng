import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import {
  blockIdForUsers,
  friendshipIdForUsers,
  sortUidPair
} from "@/lib/social/server";
import type { UserBlock } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const blockSchema = z.object({
  action: z.enum(["block", "unblock"]).default("block")
});

type RouteContext = {
  params: Promise<{ uid: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:friends_block`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { uid } = await context.params;
  if (uid === user.uid) {
    return NextResponse.json(
      { error: "You cannot block yourself." },
      { status: 400 }
    );
  }
  const payload = blockSchema.parse(await request.json().catch(() => ({})));
  const now = new Date().toISOString();

  if (payload.action === "unblock") {
    await adminDb
      .collection("blocks")
      .doc(blockIdForUsers(user.uid, uid))
      .delete();
    return NextResponse.json({ success: true, action: "unblocked" });
  }

  const friendshipRef = adminDb
    .collection("friendships")
    .doc(friendshipIdForUsers(user.uid, uid));
  const blockRef = adminDb.collection("blocks").doc(blockIdForUsers(user.uid, uid));
  const [uidA, uidB] = sortUidPair(user.uid, uid);

  await adminDb.runTransaction(async (tx) => {
    tx.delete(friendshipRef);
    const blockDoc: UserBlock = {
      id: blockRef.id,
      blockerUid: user.uid,
      blockedUid: uid,
      createdAt: now
    };
    tx.set(blockRef, blockDoc);
  });

  const pendingRequests = await adminDb
    .collection("friendRequests")
    .where("status", "==", "pending")
    .where("fromUid", "in", [uidA, uidB])
    .get();
  await Promise.all(
    pendingRequests.docs.map(async (docSnap) => {
      const data = docSnap.data() as { fromUid: string; toUid: string };
      const pair = sortUidPair(data.fromUid, data.toUid);
      if (pair[0] === uidA && pair[1] === uidB) {
        await docSnap.ref.set(
          {
            status: "cancelled",
            updatedAt: now,
            respondedAt: now
          },
          { merge: true }
        );
      }
    })
  );

  return NextResponse.json({ success: true, action: "blocked" });
}
