import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { FriendRequest } from "@/lib/social/types";

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

  const limiter = consumeRateLimit(`${user.uid}:friends_request_decline`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const requestRef = adminDb.collection("friendRequests").doc(id);
  const now = new Date().toISOString();
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  const requestData = requestSnap.data() as FriendRequest;
  if (requestData.toUid !== user.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (requestData.status !== "pending") {
    return NextResponse.json(
      { error: "Request is no longer pending." },
      { status: 409 }
    );
  }

  await requestRef.set(
    {
      status: "declined",
      respondedAt: now,
      updatedAt: now
    },
    { merge: true }
  );
  return NextResponse.json({ success: true });
}
