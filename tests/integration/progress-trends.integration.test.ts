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

async function seedQuizResult(params: {
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

async function seedPracticeSession(params: {
  uid: string;
  sessionId: string;
  createdAt: string;
  completedAt: string;
  score: number;
  total: number;
  topics: string[];
  selectedAnswers: Record<string, number>;
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
    answerIndex: number;
    explanation: string;
    topics?: string[];
  }>;
}) {
  const { adminDb } = await import("@/lib/firebase/admin");
  await adminDb
    .collection("users")
    .doc(params.uid)
    .collection("practiceSessions")
    .doc(params.sessionId)
    .set({
      id: params.sessionId,
      sourceType: "weak-topics",
      topics: params.topics,
      model: "test",
      createdAt: params.createdAt,
      status: "completed",
      questions: params.questions,
      total: params.total,
      selectedAnswers: params.selectedAnswers,
      score: params.score,
      completedAt: params.completedAt,
    });
}

describe("Progress trends route", () => {
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
        timezone: "UTC",
        topicDefaults: ["Caching", "Queues", "Scalability"],
      }),
      adminDb.collection("users").doc("user-b").set({
        uid: "user-b",
        displayName: "Bob",
        email: "bob@example.com",
        timezone: "UTC",
      }),
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    const trendsRoute = await import("@/app/api/progress-trends/route");

    const response = await trendsRoute.GET();

    expect(response.status).toBe(401);
  });

  it("returns quiz accuracy series and weak topics from quiz history", async () => {
    const trendsRoute = await import("@/app/api/progress-trends/route");

    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260319",
      completedAt: "2026-03-19T09:00:00.000Z",
      score: 0,
      selectedAnswers: { q1: 0 },
      questions: [
        {
          id: "q1",
          prompt: "Caching miss",
          choices: ["DB", "Cache", "Queue", "Cron"],
          answerIndex: 1,
          explanation: "Cache is correct.",
          topics: ["Caching"],
        },
      ],
    });
    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260320",
      completedAt: "2026-03-20T09:00:00.000Z",
      score: 1,
      selectedAnswers: { q2: 0, q3: 1 },
      questions: [
        {
          id: "q2",
          prompt: "Caching miss again",
          choices: ["DB", "Cache", "Queue", "Cron"],
          answerIndex: 1,
          explanation: "Cache is correct.",
          topics: ["Caching"],
        },
        {
          id: "q3",
          prompt: "Queue success",
          choices: ["DB", "Queue", "Cron", "Webhook"],
          answerIndex: 1,
          explanation: "Queue is correct.",
          topics: ["Queues"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await trendsRoute.GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      summary: { completedQuizzes: number; averageQuizAccuracy: number | null };
      quizSeries: Array<{ dateKey: string; accuracy: number }>;
      weakTopics: Array<{ topic: string; accuracy: number; wrong: number; total: number }>;
    };

    expect(payload.summary.completedQuizzes).toBe(2);
    expect(payload.summary.averageQuizAccuracy).toBeCloseTo(1 / 3);
    expect(payload.quizSeries).toMatchObject([
      { dateKey: "20260319", accuracy: 0 },
      { dateKey: "20260320", accuracy: 0.5 },
    ]);
    expect(payload.weakTopics[0]).toMatchObject({
      topic: "Caching",
      accuracy: 0,
      wrong: 2,
      total: 2,
    });
  });

  it("aggregates practice cadence and average accuracy by day", async () => {
    const trendsRoute = await import("@/app/api/progress-trends/route");

    await seedPracticeSession({
      uid: "user-a",
      sessionId: "practice-1",
      createdAt: "2026-03-20T07:55:00.000Z",
      completedAt: "2026-03-20T08:00:00.000Z",
      score: 2,
      total: 5,
      topics: ["Queues"],
      selectedAnswers: {
        "p1-0": 1,
        "p1-1": 1,
        "p1-2": 0,
        "p1-3": 0,
        "p1-4": 0,
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `p1-${index}`,
        prompt: `Queues prompt ${index}`,
        choices: ["A", "B", "C", "D"],
        answerIndex: index < 2 ? 1 : 2,
        explanation: "Test explanation.",
        topics: ["Queues"],
      })),
    });
    await seedPracticeSession({
      uid: "user-a",
      sessionId: "practice-2",
      createdAt: "2026-03-20T10:55:00.000Z",
      completedAt: "2026-03-20T11:00:00.000Z",
      score: 4,
      total: 5,
      topics: ["Queues"],
      selectedAnswers: {
        "p2-0": 1,
        "p2-1": 1,
        "p2-2": 1,
        "p2-3": 1,
        "p2-4": 0,
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `p2-${index}`,
        prompt: `Queues prompt late ${index}`,
        choices: ["A", "B", "C", "D"],
        answerIndex: index === 4 ? 2 : 1,
        explanation: "Test explanation.",
        topics: ["Queues"],
      })),
    });
    await seedPracticeSession({
      uid: "user-a",
      sessionId: "practice-3",
      createdAt: "2026-03-21T09:55:00.000Z",
      completedAt: "2026-03-21T10:00:00.000Z",
      score: 3,
      total: 5,
      topics: ["Scalability"],
      selectedAnswers: {
        "p3-0": 1,
        "p3-1": 1,
        "p3-2": 1,
        "p3-3": 0,
        "p3-4": 0,
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `p3-${index}`,
        prompt: `Scalability prompt ${index}`,
        choices: ["A", "B", "C", "D"],
        answerIndex: index < 3 ? 1 : 2,
        explanation: "Test explanation.",
        topics: ["Scalability"],
      })),
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await trendsRoute.GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      summary: {
        completedPracticeSessions: number;
        averagePracticeAccuracy: number | null;
      };
      practiceSeries: Array<{
        dateKey: string;
        completedCount: number;
        averageAccuracy: number;
      }>;
    };

    expect(payload.summary.completedPracticeSessions).toBe(3);
    expect(payload.summary.averagePracticeAccuracy).toBeCloseTo(0.6);
    expect(payload.practiceSeries).toMatchObject([
      {
        dateKey: "20260320",
        completedCount: 2,
        averageAccuracy: 0.6,
      },
      {
        dateKey: "20260321",
        completedCount: 1,
        averageAccuracy: 0.6,
      },
    ]);
  });

  it("uses completed practice performance to surface weak topics", async () => {
    const trendsRoute = await import("@/app/api/progress-trends/route");

    await seedPracticeSession({
      uid: "user-a",
      sessionId: "practice-queues-weak",
      createdAt: "2026-03-21T13:55:00.000Z",
      completedAt: "2026-03-21T14:00:00.000Z",
      score: 1,
      total: 4,
      topics: ["Queues"],
      selectedAnswers: { pq1: 1, pq2: 0, pq3: 0, pq4: 0 },
      questions: [
        {
          id: "pq1",
          prompt: "Queue question 1",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Test explanation.",
          topics: ["Queues"],
        },
        {
          id: "pq2",
          prompt: "Queue question 2",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Test explanation.",
          topics: ["Queues"],
        },
        {
          id: "pq3",
          prompt: "Queue question 3",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Test explanation.",
          topics: ["Queues"],
        },
        {
          id: "pq4",
          prompt: "Queue question 4",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Test explanation.",
          topics: ["Queues"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await trendsRoute.GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      weakTopics: Array<{ topic: string; accuracy: number; wrong: number; total: number }>;
    };

    expect(payload.weakTopics[0]).toMatchObject({
      topic: "Queues",
      accuracy: 0.25,
      wrong: 3,
      total: 4,
    });
  });

  it("groups practice cadence using the user's timezone", async () => {
    const trendsRoute = await import("@/app/api/progress-trends/route");
    const { adminDb } = await import("@/lib/firebase/admin");

    await adminDb.collection("users").doc("user-a").set(
      {
        timezone: "Asia/Singapore",
      },
      { merge: true }
    );
    await seedPracticeSession({
      uid: "user-a",
      sessionId: "practice-timezone-1",
      createdAt: "2026-03-20T15:50:00.000Z",
      completedAt: "2026-03-20T16:00:00.000Z",
      score: 3,
      total: 5,
      topics: ["Caching"],
      selectedAnswers: {
        tz1: 1,
        tz2: 1,
        tz3: 1,
        tz4: 0,
        tz5: 0,
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `tz-a-${index}`,
        prompt: `Timezone prompt A ${index}`,
        choices: ["A", "B", "C", "D"],
        answerIndex: index < 3 ? 1 : 2,
        explanation: "Test explanation.",
        topics: ["Caching"],
      })),
    });
    await seedPracticeSession({
      uid: "user-a",
      sessionId: "practice-timezone-2",
      createdAt: "2026-03-20T16:20:00.000Z",
      completedAt: "2026-03-20T16:30:00.000Z",
      score: 4,
      total: 5,
      topics: ["Caching"],
      selectedAnswers: {
        tz6: 1,
        tz7: 1,
        tz8: 1,
        tz9: 1,
        tz10: 0,
      },
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `tz-b-${index}`,
        prompt: `Timezone prompt B ${index}`,
        choices: ["A", "B", "C", "D"],
        answerIndex: index === 4 ? 2 : 1,
        explanation: "Test explanation.",
        topics: ["Caching"],
      })),
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await trendsRoute.GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      practiceSeries: Array<{ dateKey: string; completedCount: number }>;
    };

    expect(payload.practiceSeries).toMatchObject([
      {
        dateKey: "20260321",
        completedCount: 2,
      },
    ]);
  });

  it("normalizes topic casing when ranking weak topics", async () => {
    const trendsRoute = await import("@/app/api/progress-trends/route");

    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      score: 0,
      selectedAnswers: { q1: 0 },
      questions: [
        {
          id: "q1",
          prompt: "Caching miss title case",
          choices: ["DB", "Cache", "Queue", "Cron"],
          answerIndex: 1,
          explanation: "Cache is correct.",
          topics: ["Caching"],
        },
      ],
    });
    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260322",
      completedAt: "2026-03-22T09:00:00.000Z",
      score: 0,
      selectedAnswers: { q2: 0 },
      questions: [
        {
          id: "q2",
          prompt: "Caching miss lower case",
          choices: ["DB", "Cache", "Queue", "Cron"],
          answerIndex: 1,
          explanation: "Cache is correct.",
          topics: ["caching"],
        },
      ],
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await trendsRoute.GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      weakTopics: Array<{ topic: string; total: number; wrong: number }>;
    };

    expect(payload.weakTopics[0]).toMatchObject({
      topic: "Caching",
      total: 2,
      wrong: 2,
    });
  });
});
