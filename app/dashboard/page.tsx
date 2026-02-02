"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { firebaseAuth, firestore } from "@/lib/firebase/client";
import { clearSession } from "@/lib/auth/client";
import { useAuth } from "@/components/AuthProvider";
import type { DailyQuiz, QuizResult } from "@/lib/quiz/types";

type QuizState = {
  quiz: DailyQuiz | null;
  loading: boolean;
  error: string | null;
};

type HistoryEntry = QuizResult & {
  quiz?: DailyQuiz | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [quizState, setQuizState] = useState<QuizState>({
    quiz: null,
    loading: true,
    error: null,
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const fetchDailyQuiz = async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
    }
    setQuizState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/daily-quiz");
      if (!response.ok) {
        throw new Error("Unable to load today's quiz.");
      }
      const data = (await response.json()) as DailyQuiz;
      setQuizState({ quiz: data, loading: false, error: null });
      setAnswers({});
      setSubmitted(false);
      setScore(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load today's quiz.";
      setQuizState({ quiz: null, loading: false, error: message });
    } finally {
      if (manual) {
        setIsRefreshing(false);
      }
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    const resultsRef = collection(firestore, "users", user.uid, "quizResults");
    const snapshot = await getDocs(
      query(resultsRef, orderBy("completedAt", "desc"), limit(10))
    );
    const results = snapshot.docs.map(
      (docItem) => docItem.data() as HistoryEntry
    );
    setHistory(results);
  };

  useEffect(() => {
    if (user) {
      fetchDailyQuiz();
      fetchHistory();
    }
  }, [user]);

  const totalQuestions = quizState.quiz?.questions.length ?? 0;
  const isCompletedToday = useMemo(() => {
    if (!quizState.quiz) return false;
    return history.some((entry) => entry.dateKey === quizState.quiz?.dateKey);
  }, [history, quizState.quiz]);
  const todaysResult = useMemo(() => {
    if (!quizState.quiz) return null;
    return (
      history.find((entry) => entry.dateKey === quizState.quiz?.dateKey) ?? null
    );
  }, [history, quizState.quiz]);
  const hasAnsweredAll = useMemo(() => {
    if (!quizState.quiz) return false;
    return quizState.quiz.questions.every((question) =>
      Object.prototype.hasOwnProperty.call(answers, question.id)
    );
  }, [answers, quizState.quiz]);
  const showResults = submitted || (isCompletedToday && !!todaysResult);
  const displayAnswers = showResults
    ? submitted
      ? answers
      : todaysResult?.selectedAnswers ?? {}
    : answers;
  const displayScore =
    submitted ? score : (todaysResult?.score ?? score ?? null);
  const displayTotal = todaysResult?.total ?? totalQuestions;

  const handleSelect = (questionId: string, choiceIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
  };

  const handleSubmit = async () => {
    if (!quizState.quiz || !user) return;
    const quiz = quizState.quiz;
    const correct = quiz.questions.filter(
      (question) => answers[question.id] === question.answerIndex
    ).length;
    setScore(correct);
    setSubmitted(true);

    const result: QuizResult = {
      dateKey: quiz.dateKey,
      score: correct,
      total: quiz.questions.length,
      selectedAnswers: answers,
      completedAt: new Date().toISOString(),
    };

    await setDoc(
      doc(firestore, "users", user.uid, "quizResults", quiz.dateKey),
      result,
      { merge: true }
    );
    await fetchHistory();
  };

  const formatDateKey = (dateKey: string) => {
    const year = dateKey.slice(0, 4);
    const month = dateKey.slice(4, 6);
    const day = dateKey.slice(6, 8);
    return `${day}/${month}/${year}`;
  };

  const loadHistoryQuiz = async (dateKey: string) => {
    if (!user) return;
    const target = history.find((entry) => entry.dateKey === dateKey);
    if (target?.quiz) {
      return;
    }
    const quizRef = doc(firestore, "users", user.uid, "dailyQuizzes", dateKey);
    const quizSnap = await getDoc(quizRef);
    const quiz = quizSnap.exists()
      ? (quizSnap.data() as DailyQuiz)
      : null;
    setHistory((prev) =>
      prev.map((entry) =>
        entry.dateKey === dateKey ? { ...entry, quiz } : entry
      )
    );
  };

  const handleSignOut = async () => {
    await signOut(firebaseAuth);
    await clearSession();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              Daily System Design Quiz
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              Welcome back{user?.displayName ? `, ${user.displayName}` : ""}.
            </h1>
          </div>
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:text-white dark:hover:border-slate-400"
            type="button"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>

        <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Today&apos;s questions</h2>
            <button
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => fetchDailyQuiz(true)}
              type="button"
              disabled={isRefreshing || quizState.loading || isCompletedToday}
              aria-busy={isRefreshing || quizState.loading}
            >
              {(isRefreshing || quizState.loading) && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent dark:border-slate-400 dark:border-t-transparent" />
              )}
              Refresh
            </button>
          </div>
          {quizState.loading ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              Loading quiz...
            </p>
          ) : quizState.error ? (
            <p className="mt-6 text-sm text-rose-700 dark:text-rose-200">
              {quizState.error}
            </p>
          ) : quizState.quiz ? (
            <div className="mt-6 space-y-6">
              {isCompletedToday && todaysResult && !submitted ? (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-900 dark:text-emerald-100">
                  <p className="font-medium text-emerald-900 dark:text-emerald-100">
                    You’ve completed today’s quiz. Here are your results.
                  </p>
                  <p className="mt-2 text-emerald-800 dark:text-emerald-200">
                    Score: {todaysResult.score}/{todaysResult.total}
                  </p>
                </div>
              ) : null}
              {quizState.quiz.questions.map((question, index) => (
                <div
                  key={question.id}
                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5"
                >
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Question {index + 1}
                  </p>
                  <p className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">
                    {question.prompt}
                  </p>
                  <div className="mt-4 grid gap-2">
                    {question.choices.map((choice, choiceIndex) => {
                      const isSelected =
                        displayAnswers[question.id] === choiceIndex;
                      const isCorrect =
                        showResults && choiceIndex === question.answerIndex;
                      const isWrong =
                        showResults &&
                        isSelected &&
                        choiceIndex !== question.answerIndex;

                      return (
                        <button
                          key={choice}
                          className={`rounded-xl border px-4 py-2 text-left text-sm ${
                            isCorrect
                              ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                              : isWrong
                              ? "border-rose-400/60 bg-rose-400/10 text-rose-700 dark:text-rose-200"
                              : isSelected
                              ? "border-slate-400 bg-[color:var(--surface)] text-slate-900 dark:text-slate-100"
                              : "border-[color:var(--border)] bg-[color:var(--surface)] text-slate-700 hover:border-slate-400 dark:text-slate-200"
                          }`}
                          onClick={() =>
                            !showResults &&
                            handleSelect(question.id, choiceIndex)
                          }
                          type="button"
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                  {showResults ? (
                    <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                      Explanation: {question.explanation}
                    </p>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {totalQuestions} questions
                  </p>
                  {showResults && displayScore !== null ? (
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Score: {displayScore}/{displayTotal}
                    </p>
                  ) : null}
                </div>
                {showResults ? (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Results saved
                  </span>
                ) : (
                  <button
                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    type="button"
                    onClick={handleSubmit}
                    disabled={!hasAnsweredAll || submitted}
                  >
                    {submitted ? "Submitted" : "Submit answers"}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Recent history</h2>
          {history.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Complete your first quiz to see results here.
            </p>
          ) : (
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {history.map((result) => {
                const isExpanded = expandedDateKey === result.dateKey;
                return (
                  <div
                    key={result.dateKey}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]"
                  >
                    <button
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                      type="button"
                      onClick={async () => {
                        const next =
                          expandedDateKey === result.dateKey
                            ? null
                            : result.dateKey;
                        setExpandedDateKey(next);
                        if (next) {
                          await loadHistoryQuiz(next);
                        }
                      }}
                    >
                      <span>{formatDateKey(result.dateKey)}</span>
                      <span className="flex items-center gap-3">
                        {result.score}/{result.total}
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          {isExpanded ? "Hide" : "View"}
                        </span>
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-[color:var(--border)] px-4 py-4">
                        {!result.quiz ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Loading questions...
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {result.quiz.questions.map((question, index) => {
                              const selected =
                                result.selectedAnswers[question.id];
                              return (
                                <div
                                  key={question.id}
                                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                                >
                                  <p className="text-xs text-slate-500 dark:text-slate-500">
                                    Question {index + 1}
                                  </p>
                                  <p className="mt-2 text-sm text-slate-900 dark:text-slate-100">
                                    {question.prompt}
                                  </p>
                                  <div className="mt-3 grid gap-2 text-sm">
                                    {question.choices.map(
                                      (choice, choiceIndex) => {
                                        const isCorrect =
                                          choiceIndex === question.answerIndex;
                                        const isSelected =
                                          choiceIndex === selected;
                                        return (
                                          <div
                                            key={`${question.id}-${choiceIndex}`}
                                            className={`rounded-xl border px-3 py-2 ${
                                              isCorrect
                                                ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                                                : isSelected
                                                ? "border-rose-400/60 bg-rose-400/10 text-rose-700 dark:text-rose-200"
                                                : "border-[color:var(--border)] text-slate-600 dark:text-slate-300"
                                            }`}
                                          >
                                            {choice}
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                    Explanation: {question.explanation}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
