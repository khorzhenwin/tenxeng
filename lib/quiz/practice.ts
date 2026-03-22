import { adminDb } from "@/lib/firebase/admin";
import { getQuizReviewSessions } from "@/lib/quiz/review";
import type {
  DailyQuiz,
  PracticeSession,
  PracticeSourceType,
  QuizResult,
  WeakTopicSignal,
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
export const WEAK_TOPIC_RESULTS_SCAN_LIMIT = 30;
export const WEAK_TOPIC_SESSION_SCAN_LIMIT = 60;
const DEFAULT_WEAK_TOPIC_ACCURACY = 1;

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
  const signals = await getWeakTopicSignals(uid);
  return signals.slice(0, PRACTICE_TOPIC_LIMIT).map((entry) => entry.topic);
}

type WeakTopicSignalInput = {
  quizResults: QuizResult[];
  quizzesByDateKey: Map<string, DailyQuiz>;
  practiceSessions: PracticeSession[];
};

export function buildWeakTopicSignals({
  quizResults,
  quizzesByDateKey,
  practiceSessions,
}: WeakTopicSignalInput): WeakTopicSignal[] {
  const totals = new Map<
    string,
    { topic: string; correct: number; total: number; latestCompletedAt: string }
  >();

  const updateTotals = (
    topics: string[],
    isCorrect: boolean,
    completedAt: string
  ) => {
    uniqueTopics(topics).forEach((topic) => {
      const key = topic.toLowerCase();
      const entry = totals.get(key) ?? {
        topic,
        correct: 0,
        total: 0,
        latestCompletedAt: completedAt,
      };
      entry.total += 1;
      if (isCorrect) {
        entry.correct += 1;
      }
      if (completedAt > entry.latestCompletedAt) {
        entry.latestCompletedAt = completedAt;
      }
      if (entry.topic === entry.topic.toLowerCase() && topic !== topic.toLowerCase()) {
        entry.topic = topic;
      }
      totals.set(key, entry);
    });
  };

  quizResults.forEach((result) => {
    const quiz = quizzesByDateKey.get(result.dateKey);
    if (!quiz) {
      return;
    }

    quiz.questions.forEach((question) => {
      const topics = question.topics?.length ? question.topics : [];
      if (topics.length === 0) {
        return;
      }

      const isCorrect =
        result.selectedAnswers[question.id] === question.answerIndex;
      updateTotals(topics, isCorrect, result.completedAt);
    });
  });

  practiceSessions.forEach((session) => {
    if (session.status !== "completed" || !session.completedAt) {
      return;
    }
    const completedAt = session.completedAt;

    session.questions.forEach((question) => {
      const topics = question.topics?.length ? question.topics : [];
      if (topics.length === 0) {
        return;
      }

      const isCorrect =
        session.selectedAnswers[question.id] === question.answerIndex;
      updateTotals(topics, isCorrect, completedAt);
    });
  });

  return Array.from(totals.values())
    .map((entry) => ({
      topic: entry.topic,
      accuracy:
        entry.total > 0 ? entry.correct / entry.total : DEFAULT_WEAK_TOPIC_ACCURACY,
      total: entry.total,
      wrong: entry.total - entry.correct,
      latestCompletedAt: entry.latestCompletedAt,
    }))
    .sort((left, right) => {
      if (left.accuracy !== right.accuracy) {
        return left.accuracy - right.accuracy;
      }
      if (right.wrong !== left.wrong) {
        return right.wrong - left.wrong;
      }
      return right.total - left.total;
    });
}

export async function getWeakTopicSignals(uid: string) {
  const userRef = adminDb.collection("users").doc(uid);
  const [resultsSnap, practiceSnap] = await Promise.all([
    userRef
      .collection("quizResults")
      .orderBy("completedAt", "desc")
      .limit(WEAK_TOPIC_RESULTS_SCAN_LIMIT)
      .get(),
    userRef
      .collection("practiceSessions")
      .orderBy("createdAt", "desc")
      .limit(WEAK_TOPIC_SESSION_SCAN_LIMIT)
      .get(),
  ]);

  const quizResults = resultsSnap.docs.map((docSnap) => docSnap.data() as QuizResult);
  const practiceSessions = practiceSnap.docs.map(
    (docSnap) => docSnap.data() as PracticeSession
  );
  const quizSnaps = await Promise.all(
    quizResults.map((result) =>
      userRef.collection("dailyQuizzes").doc(result.dateKey).get()
    )
  );
  const quizzesByDateKey = new Map<string, DailyQuiz>();
  quizSnaps.forEach((quizSnap, index) => {
    if (!quizSnap.exists) {
      return;
    }
    quizzesByDateKey.set(
      quizResults[index].dateKey,
      quizSnap.data() as DailyQuiz
    );
  });

  return buildWeakTopicSignals({
    quizResults,
    quizzesByDateKey,
    practiceSessions,
  });
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
