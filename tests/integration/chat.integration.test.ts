import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  authState.user = {
    uid,
    name,
    email
  };
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

describe("Chat integration flow (Firestore-backed)", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error(
        "FIRESTORE_EMULATOR_HOST is not set. Run this test via `npm run test:integration`."
      );
    }
  });

  beforeEach(async () => {
    await clearFirestore();
    const { adminDb } = await import("@/lib/firebase/admin");

    await Promise.all([
      adminDb.collection("users").doc("user-a").set({
        uid: "user-a",
        displayName: "Alice",
        email: "alice@example.com",
        lastActiveAt: new Date().toISOString()
      }),
      adminDb.collection("users").doc("user-b").set({
        uid: "user-b",
        displayName: "Bob",
        email: "bob@example.com",
        lastActiveAt: new Date().toISOString()
      }),
      adminDb.collection("friendships").doc("user-a_user-b").set({
        id: "user-a_user-b",
        members: ["user-a", "user-b"],
        createdAt: new Date().toISOString(),
        createdBy: "user-a"
      })
    ]);
  });

  it("creates direct convo, persists messages, and updates unread/read state", async () => {
    const conversationsRoute = await import("@/app/api/chat/conversations/route");
    const messagesRoute = await import(
      "@/app/api/chat/conversations/[id]/messages/route"
    );
    const readRoute = await import("@/app/api/chat/conversations/[id]/read/route");

    // user-a opens/creates a direct conversation with user-b
    setAuthedUser("user-a", "Alice", "alice@example.com");
    const createConversationResponse = await conversationsRoute.POST(
      new Request("http://localhost/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: "user-b" })
      })
    );
    expect(createConversationResponse.status).toBe(200);
    const createConversationPayload = (await createConversationResponse.json()) as {
      conversationId: string;
    };
    expect(createConversationPayload.conversationId).toBe("direct_user-a_user-b");

    // user-a sends a message
    const sendMessageResponse = await messagesRoute.POST(
      new Request(
        `http://localhost/api/chat/conversations/${createConversationPayload.conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: "Hey Bob, let's do a PvP match." })
        }
      ),
      {
        params: Promise.resolve({
          id: createConversationPayload.conversationId
        })
      }
    );
    expect(sendMessageResponse.status).toBe(201);

    // user-b should see unread count incremented for this conversation
    setAuthedUser("user-b", "Bob", "bob@example.com");
    const listConversationsResponseBeforeRead = await conversationsRoute.GET();
    expect(listConversationsResponseBeforeRead.status).toBe(200);
    const listPayloadBeforeRead =
      (await listConversationsResponseBeforeRead.json()) as {
        conversations: Array<{ id: string; lastMessage: string | null }>;
        members: Array<{ conversationId: string; unreadCount: number }>;
      };
    expect(listPayloadBeforeRead.conversations).toHaveLength(1);
    expect(listPayloadBeforeRead.conversations[0]?.lastMessage).toContain("Hey Bob");
    expect(
      listPayloadBeforeRead.members.find(
        (entry) => entry.conversationId === createConversationPayload.conversationId
      )?.unreadCount
    ).toBe(1);

    // user-b can fetch conversation messages
    const listMessagesResponse = await messagesRoute.GET(
      new Request(
        `http://localhost/api/chat/conversations/${createConversationPayload.conversationId}/messages?limit=30`,
        { method: "GET" }
      ),
      {
        params: Promise.resolve({
          id: createConversationPayload.conversationId
        })
      }
    );
    expect(listMessagesResponse.status).toBe(200);
    const messagesPayload = (await listMessagesResponse.json()) as {
      messages: Array<{ senderUid: string; body: string }>;
    };
    expect(messagesPayload.messages).toHaveLength(1);
    expect(messagesPayload.messages[0]?.senderUid).toBe("user-a");

    // user-b marks the thread as read
    const readResponse = await readRoute.POST(
      new Request(
        `http://localhost/api/chat/conversations/${createConversationPayload.conversationId}/read`,
        { method: "POST" }
      ),
      {
        params: Promise.resolve({
          id: createConversationPayload.conversationId
        })
      }
    );
    expect(readResponse.status).toBe(200);

    // unread should return to 0
    const listConversationsResponseAfterRead = await conversationsRoute.GET();
    expect(listConversationsResponseAfterRead.status).toBe(200);
    const listPayloadAfterRead = (await listConversationsResponseAfterRead.json()) as {
      members: Array<{ conversationId: string; unreadCount: number }>;
    };
    expect(
      listPayloadAfterRead.members.find(
        (entry) => entry.conversationId === createConversationPayload.conversationId
      )?.unreadCount
    ).toBe(0);
  });

  it("rejects direct conversation creation when users are not friends", async () => {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("friendships").doc("user-a_user-b").delete();

    const conversationsRoute = await import("@/app/api/chat/conversations/route");

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await conversationsRoute.POST(
      new Request("http://localhost/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: "user-b" })
      })
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("friend list");
  });
});
