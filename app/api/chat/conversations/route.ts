import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  consumeRateLimit,
  consumeSlidingWindowRateLimit
} from "@/lib/server/rate-limit";
import {
  directConversationIdForUsers,
  hasBlockRelationship,
  usersAreFriends
} from "@/lib/social/server";
import type { Conversation, ConversationMember } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLLING_RATE_LIMIT = { windowMs: 10_000, maxRequests: 15 };

const createConversationSchema = z.object({
  targetUid: z.string().min(1)
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = await consumeSlidingWindowRateLimit(
    `${user.uid}:chat_conversations_get`,
    POLLING_RATE_LIMIT
  );
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const conversationsSnap = await adminDb
    .collection("conversations")
    .where("memberUids", "array-contains", user.uid)
    .orderBy("lastMessageAt", "desc")
    .limit(50)
    .get();
  const conversations = conversationsSnap.docs.map(
    (docSnap) => docSnap.data() as Conversation
  );

  const members = await Promise.all(
    conversations.map(async (conversation) => {
      const memberId = `${conversation.id}_${user.uid}`;
      const memberSnap = await adminDb
        .collection("conversationMembers")
        .doc(memberId)
        .get();
      return memberSnap.exists
        ? (memberSnap.data() as ConversationMember)
        : {
            id: memberId,
            conversationId: conversation.id,
            uid: user.uid,
            lastReadAt: null,
            unreadCount: 0,
            muted: false
          };
    })
  );

  return NextResponse.json({
    conversations,
    members
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:chat_conversations_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const payload = createConversationSchema.parse(await request.json());
  const targetUid = payload.targetUid.trim();
  if (targetUid === user.uid) {
    return NextResponse.json(
      { error: "You cannot create a conversation with yourself." },
      { status: 400 }
    );
  }

  const [friends, blocked] = await Promise.all([
    usersAreFriends(user.uid, targetUid),
    hasBlockRelationship(user.uid, targetUid)
  ]);
  if (!friends) {
    return NextResponse.json(
      { error: "You can only message users in your friend list." },
      { status: 403 }
    );
  }
  if (blocked) {
    return NextResponse.json(
      { error: "Unable to create conversation due to block settings." },
      { status: 403 }
    );
  }

  const conversationId = directConversationIdForUsers(user.uid, targetUid);
  const conversationRef = adminDb.collection("conversations").doc(conversationId);
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: conversationId,
    type: "direct",
    memberUids: [user.uid, targetUid].sort(),
    title: null,
    createdAt: now,
    createdBy: user.uid,
    lastMessage: null,
    lastMessageAt: null,
    lastMessageSenderUid: null
  };

  await conversationRef.set(conversation, { merge: true });
  const memberSelf: ConversationMember = {
    id: `${conversationId}_${user.uid}`,
    conversationId,
    uid: user.uid,
    lastReadAt: now,
    unreadCount: 0,
    muted: false
  };
  const memberTarget: ConversationMember = {
    id: `${conversationId}_${targetUid}`,
    conversationId,
    uid: targetUid,
    lastReadAt: null,
    unreadCount: 0,
    muted: false
  };
  await Promise.all([
    adminDb
      .collection("conversationMembers")
      .doc(memberSelf.id)
      .set(memberSelf, { merge: true }),
    adminDb
      .collection("conversationMembers")
      .doc(memberTarget.id)
      .set(memberTarget, { merge: true })
  ]);

  return NextResponse.json({ conversationId });
}
