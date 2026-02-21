import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { Conversation } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const typingSchema = z.object({
  isTyping: z.boolean()
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:chat_typing_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const payload = typingSchema.parse(await request.json());
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

  const typingRef = conversationRef
    .collection("typing")
    .doc(`${id}_${user.uid}`);
  await typingRef.set(
    {
      uid: user.uid,
      isTyping: payload.isTyping,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
  return NextResponse.json({ success: true });
}

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:chat_typing_get`);
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

  const typingSnap = await conversationRef.collection("typing").get();
  const nowMs = Date.now();
  const typingUsers = typingSnap.docs
    .map((docSnap) => docSnap.data() as { uid: string; isTyping?: boolean; updatedAt?: string })
    .filter((entry) => entry.uid !== user.uid && entry.isTyping)
    .filter((entry) => {
      const updated = entry.updatedAt ? Date.parse(entry.updatedAt) : 0;
      return Number.isFinite(updated) && nowMs - updated <= 8000;
    })
    .map((entry) => entry.uid);

  return NextResponse.json({ typingUsers });
}
