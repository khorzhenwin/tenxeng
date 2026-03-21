import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type SessionUser = {
  uid: string;
  email?: string | null;
  name?: string | null;
};

const authState: { user: SessionUser | null } = { user: null };
const generateQuizMock = vi.fn();
const embedTextMock = vi.fn();
const cosineSimilarityMock = vi.fn();

vi.mock("@/lib/auth/server", () => {
  return {
    getSessionUser: vi.fn(async () => authState.user),
  };
});

vi.mock("@/lib/quiz/generate", () => {
  return {
    generateSystemDesignQuiz: vi.fn((...args) => generateQuizMock(...args)),
  };
});

vi.mock("@/lib/quiz/embeddings", () => {
  return {
    embedText: vi.fn((...args) => embedTextMock(...args)),
    normalizeVector: vi.fn((vector: number[]) => vector),
    cosineSimilarity: vi.fn((...args) => cosineSimilarityMock(...args)),
  };
});

function setAuthedUser(uid: string, name: string, email: string) {
  authState.user = { uid, name, email };
}

function buildGeneratedQuestions(prefix: string, topics: string[] = ["Caching"]) {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    prompt: `${prefix} prompt ${index + 1}`,
    choices: ["A", "B", "C", "D"],
    answerIndex: 1,
    explanation: `${prefix} explanation ${index + 1}`,
    topics,
  }));
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

describe("Practice integration flow", () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error(
        "FIRESTORE_EMULATOR_HOST is not set. Run this test via `npm run test:integration`."
      );
    }
  });

  beforeEach(async () => {
    authState.user = null;
    generateQuizMock.mockReset();
    embedTextMock.mockReset();
    cosineSimilarityMock.mockReset();
    await clearFirestore();

    const { adminDb } = await import("@/lib/firebase/admin");
    await Promise.all([
      adminDb.collection("users").doc("user-a").set({
        uid: "user-a",
        displayName: "Alice",
        email: "alice@example.com",
        topicDefaults: ["Caching", "Scalability", "Queues"],
      }),
      adminDb.collection("users").doc("user-b").set({
        uid: "user-b",
        displayName: "Bob",
        email: "bob@example.com",
      }),
    ]);

    embedTextMock.mockImplementation(async (text: string) =>
      text.toLowerCase().includes("similar") ? [1, 0] : [0, 1]
    );
    cosineSimilarityMock.mockImplementation(
      (left: number[], right: number[]) =>
        left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
    );
  });

  it("creates a practice session from weak topics", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");

    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260320",
      completedAt: "2026-03-20T09:00:00.000Z",
      selectedAnswers: { q1: 0, q2: 1 },
      score: 1,
      questions: [
        {
          id: "q1",
          prompt: "Caching question",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Caching explanation",
          topics: ["Caching"],
        },
        {
          id: "q2",
          prompt: "Database question",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Database explanation",
          topics: ["Databases"],
        },
      ],
    });

    generateQuizMock.mockResolvedValue(buildGeneratedQuestions("weak-topics", [
      "Caching",
      "Scalability",
    ]));

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await practiceRoute.POST(
      new Request("http://localhost/api/practice-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "weak-topics" }),
      })
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      session: { id: string; sourceType: string; topics: string[]; status: string };
    };
    expect(payload.session.sourceType).toBe("weak-topics");
    expect(payload.session.topics[0]).toBe("Caching");
    expect(payload.session.status).toBe("ready");

    const { adminDb } = await import("@/lib/firebase/admin");
    const sessionSnap = await adminDb
      .collection("users")
      .doc("user-a")
      .collection("practiceSessions")
      .doc(payload.session.id)
      .get();
    expect(sessionSnap.exists).toBe(true);
  });

  it("creates a practice session from recent unresolved mistakes", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");

    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260321",
      completedAt: "2026-03-21T09:00:00.000Z",
      selectedAnswers: { q1: 0 },
      questions: [
        {
          id: "q1",
          prompt: "Recent caching miss",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Caching explanation",
          topics: ["Caching"],
        },
      ],
    });
    await seedQuizResult({
      uid: "user-a",
      dateKey: "20260320",
      completedAt: "2026-03-20T09:00:00.000Z",
      selectedAnswers: { q2: 0 },
      questions: [
        {
          id: "q2",
          prompt: "Older queue miss",
          choices: ["A", "B", "C", "D"],
          answerIndex: 1,
          explanation: "Queue explanation",
          topics: ["Queues"],
        },
      ],
    });

    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb
      .collection("users")
      .doc("user-a")
      .collection("reviewedMistakes")
      .doc("20260321:q1")
      .set({
        itemId: "20260321:q1",
        reviewedAt: "2026-03-21T10:00:00.000Z",
      });

    generateQuizMock.mockResolvedValue(buildGeneratedQuestions("recent-mistakes", [
      "Queues",
    ]));

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await practiceRoute.POST(
      new Request("http://localhost/api/practice-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "recent-mistakes" }),
      })
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      session: { topics: string[] };
    };
    expect(payload.session.topics).toContain("Queues");
    expect(payload.session.topics).not.toContain("Caching");
  });

  it("retries generation when same-topic semantic similarity is too high", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb.collection("users").doc("user-a").collection("questionHistory").add({
      questionId: "history-1",
      prompt: "Previous history question",
      promptNormalized: "previous history question",
      topics: ["Caching"],
      embedding: [1, 0],
      createdAt: "2026-03-21T08:00:00.000Z",
    });

    generateQuizMock
      .mockResolvedValueOnce(buildGeneratedQuestions("similar-caching", ["Caching"]))
      .mockResolvedValueOnce(buildGeneratedQuestions("fresh-queues", ["Queues"]));

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await practiceRoute.POST(
      new Request("http://localhost/api/practice-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "weak-topics" }),
      })
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      session: { questions: Array<{ prompt: string }> };
    };
    expect(generateQuizMock).toHaveBeenCalledTimes(2);
    expect(payload.session.questions[0]?.prompt).toContain("fresh-queues");
  });

  it("submits a practice session without affecting daily quiz results or leaderboard data", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");
    const practiceResultRoute = await import("@/app/api/practice-result/route");

    generateQuizMock.mockResolvedValue(buildGeneratedQuestions("practice-run", [
      "Scalability",
    ]));

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const createResponse = await practiceRoute.POST(
      new Request("http://localhost/api/practice-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "weak-topics" }),
      })
    );
    const createPayload = (await createResponse.json()) as {
      session: { id: string; questions: Array<{ id: string }> };
    };

    const submitResponse = await practiceResultRoute.POST(
      new Request("http://localhost/api/practice-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: createPayload.session.id,
          selectedAnswers: Object.fromEntries(
            createPayload.session.questions.map((question) => [question.id, 1])
          ),
        }),
      })
    );

    expect(submitResponse.status).toBe(200);
    const submitPayload = (await submitResponse.json()) as {
      session: { status: string; score: number; total: number };
    };
    expect(submitPayload.session.status).toBe("completed");
    expect(submitPayload.session.score).toBe(submitPayload.session.total);

    const { adminDb } = await import("@/lib/firebase/admin");
    const quizResultsSnap = await adminDb
      .collection("users")
      .doc("user-a")
      .collection("quizResults")
      .get();
    const leaderboardSnap = await adminDb.collection("leaderboards").get();
    expect(quizResultsSnap.docs).toHaveLength(0);
    expect(leaderboardSnap.docs).toHaveLength(0);
  });

  it("lists practice history in descending created order", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");
    const { adminDb } = await import("@/lib/firebase/admin");
    const userRef = adminDb.collection("users").doc("user-a");

    await userRef.collection("practiceSessions").doc("session-1").set({
      id: "session-1",
      sourceType: "weak-topics",
      topics: ["Caching"],
      questions: buildGeneratedQuestions("older"),
      createdAt: "2026-03-20T09:00:00.000Z",
      status: "completed",
      total: 5,
      selectedAnswers: {},
      score: 3,
      completedAt: "2026-03-20T09:05:00.000Z",
    });
    await userRef.collection("practiceSessions").doc("session-2").set({
      id: "session-2",
      sourceType: "recent-mistakes",
      topics: ["Queues"],
      questions: buildGeneratedQuestions("newer"),
      createdAt: "2026-03-21T09:00:00.000Z",
      status: "ready",
      total: 5,
      selectedAnswers: {},
      score: null,
      completedAt: null,
    });

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const response = await practiceRoute.GET(
      new Request("http://localhost/api/practice-quiz?limit=10")
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      sessions: Array<{ id: string }>;
    };
    expect(payload.sessions.map((session) => session.id)).toEqual([
      "session-2",
      "session-1",
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");
    const resultRoute = await import("@/app/api/practice-result/route");

    const listResponse = await practiceRoute.GET(
      new Request("http://localhost/api/practice-quiz")
    );
    expect(listResponse.status).toBe(401);

    const submitResponse = await resultRoute.POST(
      new Request("http://localhost/api/practice-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "x", selectedAnswers: {} }),
      })
    );
    expect(submitResponse.status).toBe(401);
  });

  it("validates bad payloads cleanly", async () => {
    const practiceRoute = await import("@/app/api/practice-quiz/route");
    const resultRoute = await import("@/app/api/practice-result/route");

    setAuthedUser("user-a", "Alice", "alice@example.com");
    const createResponse = await practiceRoute.POST(
      new Request("http://localhost/api/practice-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "not-valid" }),
      })
    );
    expect(createResponse.status).toBe(400);

    const submitResponse = await resultRoute.POST(
      new Request("http://localhost/api/practice-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "", selectedAnswers: {} }),
      })
    );
    expect(submitResponse.status).toBe(400);
  });
});
