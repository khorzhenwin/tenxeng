import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { friendshipIdForUsers } from "@/lib/social/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ uid: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:friends_remove`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { uid } = await context.params;
  if (uid === user.uid) {
    return NextResponse.json(
      { error: "You cannot remove yourself." },
      { status: 400 }
    );
  }

  const friendshipId = friendshipIdForUsers(user.uid, uid);
  const friendshipRef = adminDb.collection("friendships").doc(friendshipId);
  await friendshipRef.delete();
  return NextResponse.json({ success: true });
}
