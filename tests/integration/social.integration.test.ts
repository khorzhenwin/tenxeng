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

describe("Social integration flow (friend requests + challenges)", () => {
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
        email: "alice@example.com"
      }),
      adminDb.collection("users").doc("user-b").set({
        uid: "user-b",
        displayName: "Bob",
        email: "bob@example.com"
      })
    ]);
  });

  it("sends + accepts friend request and creates friendship", async () => {
    const requestRoute = await import("@/app/api/friends/request/route");
    const acceptRoute = await import(
      "@/app/api/friends/request/[id]/accept/route"
    );
    const friendsRoute = await import("@/app/api/friends/route");

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const sendRequestResponse = await requestRoute.POST(
      new Request("http://localhost/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid: "user-b" })
      })
    );
    expect(sendRequestResponse.status).toBe(201);
    const sendRequestPayload = (await sendRequestResponse.json()) as {
      request: { id: string };
    };
    expect(sendRequestPayload.request.id).toBeTruthy();

    setAuthedUser("user-b", "Bob", "bob@example.com");
    const acceptResponse = await acceptRoute.POST(
      new Request(
        `http://localhost/api/friends/request/${sendRequestPayload.request.id}/accept`,
        { method: "POST" }
      ),
      {
        params: Promise.resolve({ id: sendRequestPayload.request.id })
      }
    );
    expect(acceptResponse.status).toBe(200);

    const listFriendsResponse = await friendsRoute.GET();
    expect(listFriendsResponse.status).toBe(200);
    const listFriendsPayload = (await listFriendsResponse.json()) as {
      friends: Array<{ uid: string }>;
      incomingRequests: unknown[];
    };
    expect(listFriendsPayload.friends.some((entry) => entry.uid === "user-a")).toBe(
      true
    );
    expect(listFriendsPayload.incomingRequests).toHaveLength(0);
  });

  it("creates challenge and accepting it creates a pvp session", async () => {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("friendships").doc("user-a_user-b").set({
      id: "user-a_user-b",
      members: ["user-a", "user-b"],
      createdAt: new Date().toISOString(),
      createdBy: "user-a"
    });

    const challengesRoute = await import("@/app/api/pvp/challenges/route");
    const inboxRoute = await import("@/app/api/pvp/challenges/inbox/route");
    const acceptChallengeRoute = await import(
      "@/app/api/pvp/challenges/[id]/accept/route"
    );

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const createChallengeResponse = await challengesRoute.POST(
      new Request("http://localhost/api/pvp/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengedUid: "user-b" })
      })
    );
    expect(createChallengeResponse.status).toBe(201);
    const createChallengePayload = (await createChallengeResponse.json()) as {
      challenge: { id: string };
    };

    setAuthedUser("user-b", "Bob", "bob@example.com");
    const inboxResponse = await inboxRoute.GET();
    expect(inboxResponse.status).toBe(200);
    const inboxPayload = (await inboxResponse.json()) as {
      incoming: Array<{ id: string }>;
    };
    expect(
      inboxPayload.incoming.some(
        (entry) => entry.id === createChallengePayload.challenge.id
      )
    ).toBe(true);

    const acceptResponse = await acceptChallengeRoute.POST(
      new Request(
        `http://localhost/api/pvp/challenges/${createChallengePayload.challenge.id}/accept`,
        { method: "POST" }
      ),
      {
        params: Promise.resolve({ id: createChallengePayload.challenge.id })
      }
    );
    expect(acceptResponse.status).toBe(200);
    const acceptPayload = (await acceptResponse.json()) as { sessionId: string };
    expect(acceptPayload.sessionId).toBeTruthy();

    const sessionSnap = await adminDb
      .collection("pvpSessions")
      .doc(acceptPayload.sessionId)
      .get();
    expect(sessionSnap.exists).toBe(true);
    const session = sessionSnap.data() as { participantIds: string[]; status: string };
    expect(session.participantIds.sort()).toEqual(["user-a", "user-b"]);
    expect(session.status).toBe("ready");
  });
});
