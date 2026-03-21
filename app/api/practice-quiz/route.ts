import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { generateNovelQuizQuestions, normalizeQuestionPrompt } from "@/lib/quiz/novelty";
import { derivePracticeTopics } from "@/lib/quiz/practice";
import type { PracticeSession, PracticeSourceType } from "@/lib/quiz/types";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_NAME = "gemini-3-flash-preview";
const HISTORY_LIMIT = 200;
const MAX_RETRIES = 4;

const createSchema = z.object({
  sourceType: z.enum(["weak-topics", "recent-mistakes"]),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:practice_quiz_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters." },
      { status: 400 }
    );
  }

  const sessionsSnap = await adminDb
    .collection("users")
    .doc(user.uid)
    .collection("practiceSessions")
    .orderBy("createdAt", "desc")
    .limit(parsed.data.limit)
    .get();

  const sessions = sessionsSnap.docs.map(
    (docSnap) => docSnap.data() as PracticeSession
  );
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:practice_quiz_post`, {
    windowMs: 3000,
  });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userRef = adminDb.collection("users").doc(user.uid);
  const topics = await derivePracticeTopics(
    user.uid,
    parsed.data.sourceType as PracticeSourceType
  );
  const historySnap = await userRef
    .collection("questionHistory")
    .orderBy("createdAt", "desc")
    .limit(HISTORY_LIMIT)
    .get();
  const historyEntries = historySnap.docs.map((docSnap) => docSnap.data());

  const { questions, normalizedEmbeddings } = await generateNovelQuizQuestions({
    modelName: MODEL_NAME,
    topics,
    historyEntries,
    maxRetries: MAX_RETRIES,
  });

  const sessionRef = userRef.collection("practiceSessions").doc();
  const createdAt = new Date().toISOString();
  const session: PracticeSession = {
    id: sessionRef.id,
    sourceType: parsed.data.sourceType,
    topics,
    questions,
    createdAt,
    status: "ready",
    total: questions.length,
    selectedAnswers: {},
    score: null,
    completedAt: null,
  };

  await sessionRef.set(session);
  await Promise.all(
    questions.map((question, index) =>
      userRef.collection("questionHistory").add({
        questionId: question.id,
        prompt: question.prompt,
        promptNormalized: normalizeQuestionPrompt(question.prompt),
        topics: question.topics ?? [],
        embedding: normalizedEmbeddings[index] ?? undefined,
        practiceSessionId: session.id,
        sourceType: parsed.data.sourceType,
        createdAt: FieldValue.serverTimestamp(),
      })
    )
  );

  return NextResponse.json({ session }, { status: 201 });
}
