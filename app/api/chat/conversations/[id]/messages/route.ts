import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import type { Conversation, ConversationMessage } from "@/lib/social/types";
import { createSocialNotification } from "@/lib/social/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postMessageSchema = z.object({
  body: z.string().trim().min(1).max(1200)
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:chat_messages_get`);
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

  const url = new URL(request.url);
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("limit") ?? 30))
  );
  const messagesSnap = await conversationRef
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  const messages = messagesSnap.docs
    .map((docSnap) => docSnap.data() as ConversationMessage)
    .reverse();

  return NextResponse.json({ messages });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:chat_messages_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const payload = postMessageSchema.parse(await request.json());
  const conversationRef = adminDb.collection("conversations").doc(id);
  const now = new Date().toISOString();
  const messageRef = conversationRef.collection("messages").doc();

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

  const message: ConversationMessage = {
    id: messageRef.id,
    senderUid: user.uid,
    body: payload.body,
    kind: "text",
    createdAt: now,
    editedAt: null,
    deletedAt: null
  };
  await messageRef.set(message);

  await conversationRef.set(
    {
      lastMessage: payload.body.slice(0, 180),
      lastMessageAt: now,
      lastMessageSenderUid: user.uid
    },
    { merge: true }
  );

  const unreadTargets = conversation.memberUids.filter((uid) => uid !== user.uid);
  await Promise.all(
    unreadTargets.map((uid) =>
      adminDb
        .collection("conversationMembers")
        .doc(`${id}_${uid}`)
        .set(
          {
            unreadCount: FieldValue.increment(1)
          },
          { merge: true }
        )
    )
  );
  await Promise.all(
    unreadTargets.map((uid) =>
      createSocialNotification({
        uid,
        type: "chat_message",
        title: "New message",
        body: payload.body.slice(0, 140),
        actorUid: user.uid,
        entityId: id
      })
    )
  );
  await adminDb
    .collection("conversationMembers")
    .doc(`${id}_${user.uid}`)
    .set(
      {
        lastReadAt: now,
        unreadCount: 0
      },
      { merge: true }
    );

  return NextResponse.json({ message }, { status: 201 });
}
