import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type SessionUser = {
  uid: string;
  email?: string | null;
  name?: string | null;
};

const authState: { user: SessionUser | null } = { user: null };

vi.mock("@/lib/auth/server", () => {
  return {
    getSessionUser: vi.fn(async () => authState.user),
  };
});

function setAuthedUser(uid: string, name: string, email: string) {
  authState.user = { uid, name, email };
}

async function seedReviewSession(params: {
  uid: string;
  dateKey: string;
  completedAt: string;
  selectedAnswers: Record<string, number>;
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
    answerIndex: number;
    explanation: string;
    topics?: string[];
  }>;
  score?: number;
}) {
  const { adminDb } = await import("@/lib/firebase/admin");
  const userRef = adminDb.collection("users").doc(params.uid);
  await userRef.collection("dailyQuizzes").doc(params.dateKey).set({
    dateKey: params.dateKey,
    generatedAt: `${params.dateKey.slice(0, 4)}-${params.dateKey.slice(4, 6)}-${params.dateKey.slice(6, 8)}T08:00:00.000Z`,
    timezone: "UTC",
    model: "test",
    questions: params.questions,
    topics: params.questions.flatMap((question) => question.topics ?? []),
  });
  await userRef.collection("quizResults").doc(params.dateKey).set({
    dateKey: params.dateKey,
    score: params.score ?? 0,
    total: params.questions.length,
    selectedAnswers: params.selectedAnswers,
    completedAt: params.completedAt,
  });
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

describe("Quiz review route", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error(
        "FIRESTORE_EMULATOR_HOST is not set. Run this test via `npm run test:integration`."
      );
    }
  });

  beforeEach(async () => {
    authState.user = null;
    await clearFirestore();
    const { adminDb } = await import("@/lib/firebase/admin");
    await Promise.all([
      adminDb.collection("users").doc("user-a").set({
        uid: "user-a",
        displayName: "Alice",
        email: "alice@example.com",
      }),
      adminDb.collection("users").doc("user-b").set({
        uid: "user-b",
        displayName: "Bob",
        email: "bob@example.com",
      }),
    ]);
  });

  it("returns paginated review sessions in descending completion order", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");
    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260319",
      completedAt: "2026-03-19T09:00:00.000Z",
      selectedAnswers: { "q-oldest-1": 1 },
      questions: [
        {
          id: "q-oldest-1",
          prompt: "Oldest question",
          choices: ["Redis", "MySQL", "CDN", "Queue"],
          answerIndex: 2,
          explanation: "A CDN is best here.",
          topics: ["Caching"],
        },
      ],
    });
    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260320",
      completedAt: "2026-03-20T09:00:00.000Z",
      selectedAnswers: { "q-old-1": 0 },
      questions: [
        {
          id: "q-old-1",
          prompt: "Older question",
          choices: ["Primary DB", "Cache", "Cron", "Webhook"],
          answerIndex: 1,
          explanation: "A cache lowers read latency.",
          topics: ["Caching", "Scalability"],
        },
      ],
    });
    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      selectedAnswers: { "q-new-1": 0 },
      questions: [
        {
          id: "q-new-1",
          prompt: "Newest question",
          choices: ["Primary DB", "Cache", "Cron", "Webhook"],
          answerIndex: 1,
          explanation: "A cache lowers read latency.",
          topics: ["Caching", "Scalability"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const firstPageResponse = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review?limit=2")
    );

    expect(firstPageResponse.status).toBe(200);
    const firstPagePayload = (await firstPageResponse.json()) as {
      sessions: Array<{
        dateKey: string;
        items: Array<{
          prompt: string;
          selectedAnswer: string | null;
          correctAnswer: string;
          topics: string[];
        }>;
      }>;
      nextCursor: string | null;
    };
    expect(firstPagePayload.sessions).toHaveLength(2);
    expect(firstPagePayload.sessions.map((session) => session.dateKey)).toEqual([
      "20260321",
      "20260320",
    ]);
    expect(firstPagePayload.sessions[0].items[0]).toMatchObject({
      prompt: "Newest question",
      primaryTopic: "Caching",
      selectedAnswer: "Primary DB",
      correctAnswer: "Cache",
      topics: ["Caching", "Scalability"],
    });
    expect(firstPagePayload.nextCursor).toBe("2026-03-20T09:00:00.000Z");

    const secondPageResponse = await reviewRoute.GET(
      new Request(
        `http://localhost/api/quiz-review?limit=2&cursor=${encodeURIComponent(firstPagePayload.nextCursor ?? "")}`
      )
    );
    expect(secondPageResponse.status).toBe(200);
    const secondPagePayload = (await secondPageResponse.json()) as {
      sessions: Array<{ dateKey: string }>;
      nextCursor: string | null;
    };
    expect(secondPagePayload.sessions).toHaveLength(1);
    expect(secondPagePayload.sessions[0]).toMatchObject({
      dateKey: "20260319",
    });
    expect(secondPagePayload.nextCursor).toBeNull();
  });

  it("returns 401 for unauthenticated requests", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");

    const response = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  it("marks a mistake reviewed, hides it persistently, and backfills older sessions into the page", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");

    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260319",
      completedAt: "2026-03-19T09:00:00.000Z",
      selectedAnswers: { "q-oldest-1": 1 },
      questions: [
        {
          id: "q-oldest-1",
          prompt: "Oldest question",
          choices: ["Redis", "MySQL", "CDN", "Queue"],
          answerIndex: 2,
          explanation: "A CDN is best here.",
          topics: ["Caching"],
        },
      ],
    });
    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260320",
      completedAt: "2026-03-20T09:00:00.000Z",
      selectedAnswers: { "q-old-1": 0 },
      questions: [
        {
          id: "q-old-1",
          prompt: "Older question",
          choices: ["Primary DB", "Cache", "Cron", "Webhook"],
          answerIndex: 1,
          explanation: "A cache lowers read latency.",
          topics: ["Caching", "Scalability"],
        },
      ],
    });
    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      selectedAnswers: { "q-new-1": 0 },
      questions: [
        {
          id: "q-new-1",
          prompt: "Newest question",
          choices: ["Primary DB", "Cache", "Cron", "Webhook"],
          answerIndex: 1,
          explanation: "A cache lowers read latency.",
          topics: ["Caching", "Scalability"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const firstPageResponse = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review?limit=2")
    );
    const firstPagePayload = (await firstPageResponse.json()) as {
      sessions: Array<{
        dateKey: string;
        items: Array<{ id: string }>;
      }>;
    };
    expect(firstPagePayload.sessions.map((session) => session.dateKey)).toEqual([
      "20260321",
      "20260320",
    ]);

    const markReviewedResponse = await reviewRoute.POST(
      new Request("http://localhost/api/quiz-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: firstPagePayload.sessions[0].items[0].id,
        }),
      })
    );
    expect(markReviewedResponse.status).toBe(200);

    const filteredResponse = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review?limit=2")
    );
    expect(filteredResponse.status).toBe(200);
    const filteredPayload = (await filteredResponse.json()) as {
      sessions: Array<{ dateKey: string }>;
    };
    expect(filteredPayload.sessions.map((session) => session.dateKey)).toEqual([
      "20260320",
      "20260319",
    ]);
  });

  it("stores reviewed mistakes per user only", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");

    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      selectedAnswers: { q1: 0 },
      questions: [
        {
          id: "q1",
          prompt: "Shared question",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "B is correct.",
          topics: ["Databases"],
        },
      ],
    });
    await seedReviewSession({
      uid: "user-b",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      selectedAnswers: { q1: 0 },
      questions: [
        {
          id: "q1",
          prompt: "Shared question",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "B is correct.",
          topics: ["Databases"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const reviewAResponse = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review")
    );
    const reviewAPayload = (await reviewAResponse.json()) as {
      sessions: Array<{ items: Array<{ id: string }> }>;
    };

    await reviewRoute.POST(
      new Request("http://localhost/api/quiz-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: reviewAPayload.sessions[0].items[0].id,
        }),
      })
    );

    const hiddenAResponse = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review")
    );
    await expect(hiddenAResponse.json()).resolves.toMatchObject({
      sessions: [],
      nextCursor: null,
    });

    setAuthedUser("user-b", "Bob", "bob@example.com");
    const reviewBResponse = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review")
    );
    const reviewBPayload = (await reviewBResponse.json()) as {
      sessions: Array<{ dateKey: string }>;
    };
    expect(reviewBPayload.sessions).toHaveLength(1);
    expect(reviewBPayload.sessions[0]).toMatchObject({
      dateKey: "20260321",
    });
  });

  it("returns an empty list when the user has no wrong answers", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");
    await seedReviewSession({
      uid: "user-a",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      score: 1,
      selectedAnswers: { q1: 2 },
      questions: [
        {
          id: "q1",
          prompt: "Correct question",
          choices: ["A", "B", "C", "D"],
          answerIndex: 2,
          explanation: "C is correct.",
          topics: ["Databases"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessions: [],
      nextCursor: null,
    });
  });

  it("skips quiz results whose quiz document is missing", async () => {
    const { adminDb } = await import("@/lib/firebase/admin");
    const reviewRoute = await import("@/app/api/quiz-review/route");
    const userRef = adminDb.collection("users").doc("user-a");

    await userRef.collection("quizResults").doc("20260319").set({
      dateKey: "20260319",
      score: 0,
      total: 1,
      selectedAnswers: { "missing-q": 0 },
      completedAt: "2026-03-19T09:00:00.000Z",
    });

    await userRef.collection("dailyQuizzes").doc("20260321").set({
      dateKey: "20260321",
      generatedAt: "2026-03-21T08:00:00.000Z",
      timezone: "UTC",
      model: "test",
      questions: [
        {
          id: "q1",
          prompt: "Available question",
          choices: ["A", "B", "C", "D"],
          answerIndex: 3,
          explanation: "D is correct.",
          topics: ["Scalability"],
        },
      ],
      topics: ["Scalability"],
    });
    await userRef.collection("quizResults").doc("20260321").set({
      dateKey: "20260321",
      score: 0,
      total: 1,
      selectedAnswers: { q1: 0 },
      completedAt: "2026-03-21T09:00:00.000Z",
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      sessions: Array<{ dateKey: string; items: Array<{ prompt: string }> }>;
      nextCursor: string | null;
    };
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      dateKey: "20260321",
    });
    expect(payload.sessions[0].items[0]).toMatchObject({
      prompt: "Available question",
    });
    expect(payload.nextCursor).toBeNull();
  });

  it("returns 400 for an invalid pagination cursor", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await reviewRoute.GET(
      new Request("http://localhost/api/quiz-review?cursor=not-a-date")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid query parameters.",
    });
  });

  it("returns 400 for an invalid reviewed-mistake request body", async () => {
    const reviewRoute = await import("@/app/api/quiz-review/route");

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await reviewRoute.POST(
      new Request("http://localhost/api/quiz-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "bad-id" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request body.",
    });
  });
});
