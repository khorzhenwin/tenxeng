import { adminDb } from "@/lib/firebase/admin";
import type {
  DailyQuiz,
  QuizQuestion,
  QuizResult,
  ReviewedMistake,
  QuizReviewItem,
  QuizReviewSession,
} from "@/lib/quiz/types";

const DEFAULT_PAGE_LIMIT = 4;
const MAX_PAGE_LIMIT = 12;
const MAX_SCAN_RESULTS = 200;
const FALLBACK_TOPIC = "Uncategorized";

function getPrimaryTopic(topics?: string[]) {
  const primary = topics?.find((topic) => topic.trim().length > 0)?.trim();
  return primary ?? FALLBACK_TOPIC;
}

async function getReviewedMistakeIds(uid: string) {
  const reviewedSnap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("reviewedMistakes")
    .get();

  return new Set(
    reviewedSnap.docs.map((docSnap) => {
      const data = docSnap.data() as Partial<ReviewedMistake>;
      return typeof data.itemId === "string" && data.itemId.length > 0
        ? data.itemId
        : docSnap.id;
    })
  );
}

function buildReviewItem(
  result: QuizResult,
  question: QuizQuestion,
  selectedAnswerIndex: number | null
): QuizReviewItem {
  return {
    id: `${result.dateKey}:${question.id}`,
    dateKey: result.dateKey,
    completedAt: result.completedAt,
    questionId: question.id,
    primaryTopic: getPrimaryTopic(question.topics),
    prompt: question.prompt,
    choices: question.choices,
    selectedAnswerIndex,
    selectedAnswer:
      selectedAnswerIndex !== null
        ? (question.choices[selectedAnswerIndex] ?? null)
        : null,
    correctAnswerIndex: question.answerIndex,
    correctAnswer: question.choices[question.answerIndex] ?? "",
    explanation: question.explanation,
    topics: question.topics ?? [],
  };
}

function getWrongAnswerItems(
  result: QuizResult,
  quiz: DailyQuiz
): QuizReviewItem[] {
  return quiz.questions.flatMap((question) => {
    const rawSelectedAnswer = result.selectedAnswers[question.id];
    const selectedAnswerIndex = Number.isInteger(rawSelectedAnswer)
      ? rawSelectedAnswer
      : null;

    if (selectedAnswerIndex === question.answerIndex) {
      return [];
    }

    return [buildReviewItem(result, question, selectedAnswerIndex)];
  });
}

function buildReviewSession(
  result: QuizResult,
  quiz: DailyQuiz,
  reviewedMistakeIds: Set<string>
): QuizReviewSession | null {
  const items = getWrongAnswerItems(result, quiz).filter(
    (item) => !reviewedMistakeIds.has(item.id)
  );
  if (items.length === 0) {
    return null;
  }

  return {
    id: result.dateKey,
    dateKey: result.dateKey,
    completedAt: result.completedAt,
    score: result.score,
    total: result.total,
    mistakeCount: items.length,
    items,
  };
}

export async function getQuizReviewSessions(
  uid: string,
  options?: { limit?: number; cursor?: string | null }
): Promise<{ sessions: QuizReviewSession[]; nextCursor: string | null }> {
  const pageLimit = Math.max(
    1,
    Math.min(options?.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT)
  );
  const batchLimit = Math.max(10, Math.min(40, pageLimit * 3));
  const userRef = adminDb.collection("users").doc(uid);
  const reviewedMistakeIds = await getReviewedMistakeIds(uid);

  let cursor = options?.cursor ?? null;
  let scannedCount = 0;
  let exhausted = false;
  const sessions: QuizReviewSession[] = [];

  while (sessions.length <= pageLimit && scannedCount < MAX_SCAN_RESULTS && !exhausted) {
    let query = userRef
      .collection("quizResults")
      .orderBy("completedAt", "desc")
      .limit(batchLimit);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const resultsSnap = await query.get();
    if (resultsSnap.empty) {
      break;
    }

    const results = resultsSnap.docs.map((docSnap) => docSnap.data() as QuizResult);
    const quizSnaps = await Promise.all(
      results.map((result) =>
        userRef.collection("dailyQuizzes").doc(result.dateKey).get()
      )
    );

    for (const [index, result] of results.entries()) {
      scannedCount += 1;
      cursor = result.completedAt;
      const quizSnap = quizSnaps[index];
      if (!quizSnap.exists) {
        continue;
      }

      const quiz = quizSnap.data() as DailyQuiz;
      const session = buildReviewSession(result, quiz, reviewedMistakeIds);
      if (session) {
        sessions.push(session);
      }

      if (sessions.length > pageLimit || scannedCount >= MAX_SCAN_RESULTS) {
        break;
      }
    }

    if (resultsSnap.docs.length < batchLimit) {
      exhausted = true;
    }
  }

  const visibleSessions = sessions.slice(0, pageLimit);
  const hasMore = sessions.length > pageLimit;
  const nextCursor = hasMore
    ? (visibleSessions[visibleSessions.length - 1]?.completedAt ?? null)
    : null;

  return {
    sessions: visibleSessions,
    nextCursor,
  };
}
