import { adminDb } from "@/lib/firebase/admin";
import { getQuizReviewSessions } from "@/lib/quiz/review";
import type {
  DailyQuiz,
  PracticeSession,
  PracticeSourceType,
  QuizResult,
} from "@/lib/quiz/types";

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
const PRACTICE_TOPIC_LIMIT = 3;
const PRACTICE_RESULTS_SCAN_LIMIT = 60;

function uniqueTopics(topics: string[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  topics.forEach((topic) => {
    const normalized = topic.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(normalized);
  });
  return ordered;
}

function getDefaultTopics(data: Record<string, unknown> | undefined) {
  const configured = Array.isArray(data?.topicDefaults)
    ? (data?.topicDefaults as string[])
    : [];
  const selected = uniqueTopics(configured).slice(0, PRACTICE_TOPIC_LIMIT);
  return selected.length > 0
    ? selected
    : DEFAULT_TOPICS.slice(0, PRACTICE_TOPIC_LIMIT);
}

async function deriveRecentMistakeTopics(uid: string) {
  const { sessions } = await getQuizReviewSessions(uid, { limit: 6 });
  const topics = uniqueTopics(
    sessions.flatMap((session) =>
      session.items.flatMap((item) =>
        item.topics.length > 0 ? item.topics : [item.primaryTopic]
      )
    )
  );
  return topics.slice(0, PRACTICE_TOPIC_LIMIT);
}

async function deriveWeakTopics(uid: string) {
  const userRef = adminDb.collection("users").doc(uid);
  const resultsSnap = await userRef
    .collection("quizResults")
    .orderBy("completedAt", "desc")
    .limit(PRACTICE_RESULTS_SCAN_LIMIT)
    .get();

  if (resultsSnap.empty) {
    return [];
  }

  const results = resultsSnap.docs.map((docSnap) => docSnap.data() as QuizResult);
  const quizSnaps = await Promise.all(
    results.map((result) => userRef.collection("dailyQuizzes").doc(result.dateKey).get())
  );
  const totals = new Map<string, { correct: number; total: number }>();

  results.forEach((result, index) => {
    const quizSnap = quizSnaps[index];
    if (!quizSnap.exists) {
      return;
    }

    const quiz = quizSnap.data() as DailyQuiz;
    quiz.questions.forEach((question) => {
      const topics = question.topics?.length ? question.topics : [];
      if (topics.length === 0) {
        return;
      }

      const isCorrect =
        result.selectedAnswers[question.id] === question.answerIndex;
      topics.forEach((topic) => {
        const entry = totals.get(topic) ?? { correct: 0, total: 0 };
        entry.total += 1;
        if (isCorrect) {
          entry.correct += 1;
        }
        totals.set(topic, entry);
      });
    });
  });

  return Array.from(totals.entries())
    .map(([topic, entry]) => ({
      topic,
      accuracy: entry.total > 0 ? entry.correct / entry.total : 1,
      total: entry.total,
      wrong: entry.total - entry.correct,
    }))
    .sort((left, right) => {
      if (left.accuracy !== right.accuracy) {
        return left.accuracy - right.accuracy;
      }
      if (right.wrong !== left.wrong) {
        return right.wrong - left.wrong;
      }
      return right.total - left.total;
    })
    .slice(0, PRACTICE_TOPIC_LIMIT)
    .map((entry) => entry.topic);
}

export async function derivePracticeTopics(
  uid: string,
  sourceType: PracticeSourceType
) {
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const defaults = getDefaultTopics(
    userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined
  );

  if (sourceType === "recent-mistakes") {
    const mistakeTopics = await deriveRecentMistakeTopics(uid);
    if (mistakeTopics.length > 0) {
      return mistakeTopics;
    }
    const weakTopics = await deriveWeakTopics(uid);
    return weakTopics.length > 0 ? weakTopics : defaults;
  }

  const weakTopics = await deriveWeakTopics(uid);
  if (weakTopics.length > 0) {
    return weakTopics;
  }

  const mistakeTopics = await deriveRecentMistakeTopics(uid);
  return mistakeTopics.length > 0 ? mistakeTopics : defaults;
}

export function toPracticeSessionSummary(session: PracticeSession) {
  return {
    id: session.id,
    sourceType: session.sourceType,
    topics: session.topics,
    status: session.status,
    total: session.total,
    score: session.score,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
  };
}
