import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { Conversation } from "@/lib/social/types";

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
  const limiter = consumeRateLimit(`${user.uid}:chat_read_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const conversationRef = adminDb.collection("conversations").doc(id);
  const conversationSnap = await conversationRef.get();
  if (!conversationSnap.exists) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );
  }
  const conversation = conversationSnap.data() as Conversation;
  if (!conversation.memberUids.includes(user.uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await adminDb
    .collection("conversationMembers")
    .doc(`${id}_${user.uid}`)
    .set(
      {
        lastReadAt: new Date().toISOString(),
        unreadCount: 0
      },
      { merge: true }
    );
  return NextResponse.json({ success: true });
}
