import { adminDb } from "@/lib/firebase/admin";
import { getDateKeyForTimezone } from "@/lib/quiz/date";
import {
  buildWeakTopicSignals,
  WEAK_TOPIC_RESULTS_SCAN_LIMIT,
  WEAK_TOPIC_SESSION_SCAN_LIMIT,
} from "@/lib/quiz/practice";
import type {
  DailyQuiz,
  PracticeSession,
  ProgressTrendsPayload,
  PracticeTrendPoint,
  QuizResult,
  QuizTrendPoint,
} from "@/lib/quiz/types";

const WEAK_TOPIC_LIMIT = 6;

function toAccuracy(score: number, total: number) {
  return total > 0 ? score / total : 0;
}

export async function getProgressTrends(uid: string): Promise<ProgressTrendsPayload> {
  const userRef = adminDb.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const timezone =
    (userSnap.data()?.timezone as string | undefined) ?? "UTC";

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

  const quizResults = resultsSnap.docs.map(
    (docSnap) => docSnap.data() as QuizResult
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
  const quizSeries: QuizTrendPoint[] = quizResults
    .map((result) => ({
      dateKey: result.dateKey,
      score: result.score,
      total: result.total,
      accuracy: toAccuracy(result.score, result.total),
      completedAt: result.completedAt,
    }))
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt));

  const practiceSessions = practiceSnap.docs
    .map((docSnap) => docSnap.data() as PracticeSession)
    .filter(
      (session): session is PracticeSession & { completedAt: string; score: number } =>
        session.status === "completed" &&
        typeof session.completedAt === "string" &&
        typeof session.score === "number"
    );

  const practiceByDate = new Map<
    string,
    { completedCount: number; totalScore: number; totalQuestions: number }
  >();
  practiceSessions.forEach((session) => {
    const dateKey = getDateKeyForTimezone(timezone, new Date(session.completedAt));
    const entry = practiceByDate.get(dateKey) ?? {
      completedCount: 0,
      totalScore: 0,
      totalQuestions: 0,
    };
    entry.completedCount += 1;
    entry.totalScore += session.score;
    entry.totalQuestions += session.total;
    practiceByDate.set(dateKey, entry);
  });

  const practiceSeries: PracticeTrendPoint[] = Array.from(practiceByDate.entries())
    .map(([dateKey, entry]) => ({
      dateKey,
      completedCount: entry.completedCount,
      averageAccuracy: toAccuracy(entry.totalScore, entry.totalQuestions),
      totalQuestions: entry.totalQuestions,
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  const totalQuizCorrect = quizSeries.reduce((sum, point) => sum + point.score, 0);
  const totalQuizQuestions = quizSeries.reduce((sum, point) => sum + point.total, 0);
  const totalPracticeCorrect = practiceSessions.reduce(
    (sum, session) => sum + session.score,
    0
  );
  const totalPracticeQuestions = practiceSessions.reduce(
    (sum, session) => sum + session.total,
    0
  );
  const weakTopics = buildWeakTopicSignals({
    quizResults,
    quizzesByDateKey,
    practiceSessions,
  });
  const averageQuizAccuracy =
    totalQuizQuestions > 0
      ? toAccuracy(totalQuizCorrect, totalQuizQuestions)
      : null;
  const averagePracticeAccuracy =
    totalPracticeQuestions > 0
      ? toAccuracy(totalPracticeCorrect, totalPracticeQuestions)
      : null;

  return {
    summary: {
      completedQuizzes: quizSeries.length,
      completedPracticeSessions: practiceSessions.length,
      averageQuizAccuracy,
      averagePracticeAccuracy,
    },
    quizSeries,
    practiceSeries,
    weakTopics: weakTopics.slice(0, WEAK_TOPIC_LIMIT),
  };
}
