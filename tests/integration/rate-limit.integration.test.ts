import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type SessionUser = {
  uid: string;
  email?: string | null;
  name?: string | null;
};

const authState: { user: SessionUser | null } = { user: null };

vi.mock("@/lib/auth/server", () => {
  return {
    getSessionUser: vi.fn(async () => authState.user)
  };
});

function setAuthedUser(uid: string, name: string, email: string) {
  authState.user = { uid, name, email };
}

async function clearFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-tenxeng";
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Unable to clear emulator data: ${payload}`);
  }
}

describe("Rate limiting integration compatibility", () => {
  const previousToggle = process.env.ENABLE_RATE_LIMIT_IN_TESTS;

  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error(
        "FIRESTORE_EMULATOR_HOST is not set. Run this test via `npm run test:integration`."
      );
    }
    process.env.ENABLE_RATE_LIMIT_IN_TESTS = "true";
  });

  afterAll(() => {
    if (typeof previousToggle === "string") {
      process.env.ENABLE_RATE_LIMIT_IN_TESTS = previousToggle;
      return;
    }
    delete process.env.ENABLE_RATE_LIMIT_IN_TESTS;
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  it("enforces 15/10s sliding window for chat message polling", async () => {
    const { adminDb } = await import("@/lib/firebase/admin");
    const messagesRoute = await import(
      "@/app/api/chat/conversations/[id]/messages/route"
    );

    const uid = "rate-user-messages";
    const peerUid = "rate-peer-messages";
    const conversationId = "direct_rate-peer-messages_rate-user-messages";
    const now = new Date().toISOString();

    await Promise.all([
      adminDb.collection("users").doc(uid).set({ uid, email: "rate@example.com" }),
      adminDb
        .collection("users")
        .doc(peerUid)
        .set({ uid: peerUid, email: "peer@example.com" }),
      adminDb.collection("conversations").doc(conversationId).set({
        id: conversationId,
        type: "direct",
        memberUids: [peerUid, uid].sort(),
        title: null,
        createdAt: now,
        createdBy: uid,
        lastMessage: "seed",
        lastMessageAt: now,
        lastMessageSenderUid: uid
      }),
      adminDb
        .collection("conversations")
        .doc(conversationId)
        .collection("messages")
        .doc("seed-message")
        .set({
          id: "seed-message",
          senderUid: uid,
          body: "seed",
          kind: "text",
          createdAt: now,
          editedAt: null,
          deletedAt: null
        })
    ]);

    setAuthedUser(uid, "Rate User", "rate@example.com");

    for (let index = 0; index < 15; index += 1) {
      const response = await messagesRoute.GET(
        new Request(
          `http://localhost/api/chat/conversations/${conversationId}/messages?limit=1`,
          { method: "GET" }
        ),
        { params: Promise.resolve({ id: conversationId }) }
      );
      expect(response.status).toBe(200);
    }

    const blocked = await messagesRoute.GET(
      new Request(
        `http://localhost/api/chat/conversations/${conversationId}/messages?limit=1`,
        { method: "GET" }
      ),
      { params: Promise.resolve({ id: conversationId }) }
    );
    expect(blocked.status).toBe(429);

    const limiterStoreSnap = await adminDb
      .collection("__rateLimits")
      .where("key", "==", `${uid}:chat_messages_get`)
      .limit(1)
      .get();
    expect(limiterStoreSnap.size).toBe(1);
    const limiterRecord = limiterStoreSnap.docs[0]?.data() as
      | { maxRequests?: number; windowMs?: number }
      | undefined;
    expect(limiterRecord?.maxRequests).toBe(15);
    expect(limiterRecord?.windowMs).toBe(10_000);
  });

  it("enforces 15/10s sliding window for notifications polling", async () => {
    const { adminDb } = await import("@/lib/firebase/admin");
    const notificationsRoute = await import("@/app/api/notifications/route");
    const uid = "rate-user-notifications";

    setAuthedUser(uid, "Rate User", "rate@example.com");

    for (let index = 0; index < 15; index += 1) {
      const response = await notificationsRoute.GET();
      expect(response.status).toBe(200);
    }

    const blocked = await notificationsRoute.GET();
    expect(blocked.status).toBe(429);

    const limiterStoreSnap = await adminDb
      .collection("__rateLimits")
      .where("key", "==", `${uid}:notifications_get`)
      .limit(1)
      .get();
    expect(limiterStoreSnap.size).toBe(1);
  });

  it("keeps non-polling limiter behavior for chat conversation creation", async () => {
    const { adminDb } = await import("@/lib/firebase/admin");
    const conversationsRoute = await import("@/app/api/chat/conversations/route");

    const userA = "rate-user-a";
    const userB = "rate-user-b";
    const now = new Date().toISOString();

    await Promise.all([
      adminDb
        .collection("users")
        .doc(userA)
        .set({ uid: userA, displayName: "Alice", email: "alice@example.com" }),
      adminDb
        .collection("users")
        .doc(userB)
        .set({ uid: userB, displayName: "Bob", email: "bob@example.com" }),
      adminDb.collection("friendships").doc(`${userA}_${userB}`).set({
        id: `${userA}_${userB}`,
        members: [userA, userB],
        createdAt: now,
        createdBy: userA
      })
    ]);

    setAuthedUser(userA, "Alice", "alice@example.com");

    const firstResponse = await conversationsRoute.POST(
      new Request("http://localhost/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: userB })
      })
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await conversationsRoute.POST(
      new Request("http://localhost/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: userB })
      })
    );
    expect(secondResponse.status).toBe(429);
  });
});
