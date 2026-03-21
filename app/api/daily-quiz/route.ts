import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import { getDateKeyForTimezone } from "@/lib/quiz/date";
import {
  generateNovelQuizQuestions,
  normalizeQuestionPrompt,
} from "@/lib/quiz/novelty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_NAME = "gemini-3-flash-preview";
const HISTORY_LIMIT = 200;
const MAX_RETRIES = 3;
const DEFAULT_TOPICS = [
  "Caching",
  "Load balancing",
  "Databases",
  "Data modeling",
  "Consistency",
  "Queues",
  "Observability",
  "API design",
  "Security",
  "Scalability",
];

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRef = adminDb.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  const timezone =
    (userSnap.data()?.timezone as string | undefined) ?? "UTC";
  const dateKey = getDateKeyForTimezone(timezone);
  const scheduleRef = userRef.collection("topicSchedules").doc(dateKey);
  const scheduleSnap = await scheduleRef.get();
  const scheduledTopics = Array.isArray(scheduleSnap.data()?.topics)
    ? (scheduleSnap.data()?.topics as string[])
    : [];
  const defaultTopics = Array.isArray(userSnap.data()?.topicDefaults)
    ? (userSnap.data()?.topicDefaults as string[])
    : DEFAULT_TOPICS;
  const topics = scheduledTopics.length > 0 ? scheduledTopics : defaultTopics;

  const quizRef = userRef.collection("dailyQuizzes").doc(dateKey);
  const quizSnap = await quizRef.get();

  if (quizSnap.exists) {
    await userRef.set(
      { lastActiveAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return NextResponse.json(quizSnap.data());
  }

  const historyRef = userRef
    .collection("questionHistory")
    .orderBy("createdAt", "desc")
    .limit(HISTORY_LIMIT);
  const historySnap = await historyRef.get();
  const historyEntries = historySnap.docs.map((doc) => doc.data());
  const { questions, normalizedEmbeddings } = await generateNovelQuizQuestions({
    modelName: MODEL_NAME,
    topics,
    historyEntries,
    maxRetries: MAX_RETRIES,
  });
  const quiz = {
    dateKey,
    timezone,
    model: MODEL_NAME,
    questions,
    topics,
    generatedAt: new Date().toISOString(),
  };

  await quizRef.set(quiz);
  const historyWrites = questions.map((question, index) => {
    const promptNormalized = normalizeQuestionPrompt(question.prompt);
    const embedding = normalizedEmbeddings[index]
      ? normalizedEmbeddings[index]
      : undefined;
    return userRef.collection("questionHistory").add({
      questionId: question.id,
      prompt: question.prompt,
      promptNormalized,
      topics: question.topics ?? [],
      embedding,
      dateKey,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await Promise.all(historyWrites);
  await userRef.set(
    {
      timezone,
      lastActiveAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json(quiz);
}
