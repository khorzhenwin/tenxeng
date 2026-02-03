"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  limit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { firebaseAuth, firestore } from "@/lib/firebase/client";
import { clearSession } from "@/lib/auth/client";
import { useAuth } from "@/components/AuthProvider";
import type { DailyQuiz, QuizResult } from "@/lib/quiz/types";
import {
  getDateKeyForTimezone,
  getMonthWeekStarts,
  getWeekEndDateKey,
  getWeekStartDateKey,
  parseDateKeyToDate,
  addDays,
} from "@/lib/quiz/date";

type QuizState = {
  quiz: DailyQuiz | null;
  loading: boolean;
  error: string | null;
};

type HistoryEntry = QuizResult & {
  quiz?: DailyQuiz | null;
};

type LeaderboardEntry = {
  uid: string;
  displayName: string | null;
  email?: string | null;
  correct: number;
  total: number;
  accuracy?: number;
};

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
const LEADERBOARD_TIMEZONE = "Asia/Singapore";

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
  const [topicDefaults, setTopicDefaults] = useState<string[]>(DEFAULT_TOPICS);
  const [topicLibrary, setTopicLibrary] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [scheduleMap, setScheduleMap] = useState<Record<string, string[]>>({});
  const [applyDays, setApplyDays] = useState(3);
  const [timezone, setTimezone] = useState("UTC");
  const [activeTab, setActiveTab] = useState<
    "questions" | "preferences" | "leaderboard"
  >("questions");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<
    Record<string, LeaderboardEntry[]>
  >({});
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardLimit, setLeaderboardLimit] = useState(10);
  const [leaderboardRefreshWeek, setLeaderboardRefreshWeek] = useState<
    string | null
  >(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardRequested, setLeaderboardRequested] = useState<
    Record<string, boolean>
  >({});

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

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    const resultsRef = collection(firestore, "users", user.uid, "quizResults");
    const snapshot = await getDocs(
      query(resultsRef, orderBy("completedAt", "desc"), limit(30))
    );
    const results = snapshot.docs.map(
      (docItem) => docItem.data() as HistoryEntry
    );
    setHistory(results);
  }, [user]);

  const loadUserSettings = useCallback(async () => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();
    const storedTimezone =
      (data?.timezone as string | undefined) ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC";
    const storedDefaults = Array.isArray(data?.topicDefaults)
      ? (data?.topicDefaults as string[])
      : DEFAULT_TOPICS;
    const storedLibrary = Array.isArray(data?.topicLibrary)
      ? (data?.topicLibrary as string[])
      : [];

    setTimezone(storedTimezone);
    setTopicDefaults(storedDefaults);
    setTopicLibrary(storedLibrary);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDailyQuiz();
      fetchHistory();
      loadUserSettings();
    }
  }, [user, fetchHistory, loadUserSettings]);

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
  const scheduleDays = useMemo(() => {
    const baseDate = new Date();
    if (isCompletedToday) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
    return Array.from({ length: 5 }, (_, index) => {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + index);
      const dateKey = getDateKeyForTimezone(timezone, nextDate);
      return {
        dateKey,
        label: formatDateKey(dateKey),
      };
    });
  }, [timezone, isCompletedToday]);
  const availableTopics = useMemo(() => {
    const merged = new Set<string>([
      ...DEFAULT_TOPICS,
      ...topicLibrary.map((topic) => topic.trim()).filter(Boolean),
    ]);
    return Array.from(merged);
  }, [topicLibrary]);
  const streakCount = useMemo(() => {
    if (!history.length) return 0;
    const answeredDates = new Set(history.map((entry) => entry.dateKey));
    const todayKey = getDateKeyForTimezone(timezone);
    const yesterdayKey = getDateKeyForTimezone(
      timezone,
      addDays(parseDateKeyToDate(todayKey), -1)
    );
    const startKey = answeredDates.has(todayKey) ? todayKey : yesterdayKey;
    if (!answeredDates.has(startKey)) {
      return 0;
    }
    let streak = 0;
    let cursor = parseDateKeyToDate(startKey);
    while (true) {
      const key = getDateKeyForTimezone(timezone, cursor);
      if (!answeredDates.has(key)) break;
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }, [history, timezone]);
  const monthWeekStarts = useMemo(
    () => getMonthWeekStarts(LEADERBOARD_TIMEZONE),
    []
  );
  const currentWeekStart = useMemo(
    () => getWeekStartDateKey(LEADERBOARD_TIMEZONE),
    []
  );
  const visibleWeekStarts = useMemo(
    () =>
      monthWeekStarts.filter((weekStart) => weekStart <= currentWeekStart),
    [monthWeekStarts, currentWeekStart]
  );

  const handleSelect = (questionId: string, choiceIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
  };

  const handleSubmit = async () => {
    if (!quizState.quiz || !user) return;
    setSubmitError(null);
    const quiz = quizState.quiz;
    try {
      const response = await fetch("/api/quiz-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateKey: quiz.dateKey,
          selectedAnswers: answers,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to submit quiz results.");
      }
      const data = (await response.json()) as { score: number; total: number };
      setScore(data.score);
      setSubmitted(true);
      await fetchDailyQuiz();
      await fetchHistory();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit answers.";
      setSubmitError(message);
    }
  };

  function formatDateKey(dateKey: string) {
    const year = dateKey.slice(0, 4);
    const month = dateKey.slice(4, 6);
    const day = dateKey.slice(6, 8);
    return `${day}/${month}/${year}`;
  }

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

  useEffect(() => {
    const loadSchedules = async () => {
      if (!user || scheduleDays.length === 0) return;
      const scheduleDocs = await Promise.all(
        scheduleDays.map((day) =>
          getDoc(
            doc(firestore, "users", user.uid, "topicSchedules", day.dateKey)
          )
        )
      );
      const nextMap: Record<string, string[]> = {};
      scheduleDocs.forEach((docSnap, index) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data?.topics)) {
            nextMap[scheduleDays[index].dateKey] = data.topics as string[];
          }
        }
      });
      setScheduleMap(nextMap);
    };

    loadSchedules();
  }, [user, scheduleDays]);

  useEffect(() => {
    const loadLeaderboards = async () => {
      if (
        !user ||
        visibleWeekStarts.length === 0 ||
        activeTab !== "leaderboard"
      ) {
        return;
      }
      setLeaderboardLoading(true);
      const entriesByWeek: Record<string, LeaderboardEntry[]> = {};

      await Promise.all(
        visibleWeekStarts.map(async (weekStart) => {
          const leaderboardSnap = await getDoc(
            doc(firestore, "leaderboards", weekStart)
          );
          const data = leaderboardSnap.data();
          const topEntries = Array.isArray(data?.topEntries)
            ? (data?.topEntries as LeaderboardEntry[])
            : [];
          entriesByWeek[weekStart] = topEntries;
        })
      );

      setLeaderboards(entriesByWeek);
      setLeaderboardLoading(false);
    };

    loadLeaderboards();
  }, [user, visibleWeekStarts, activeTab]);

  useEffect(() => {
    if (activeTab !== "leaderboard") return;
    if (visibleWeekStarts.includes(currentWeekStart)) {
      setExpandedWeek(currentWeekStart);
    }
  }, [activeTab, currentWeekStart, visibleWeekStarts]);

  const refreshLeaderboardWeek = useCallback(
    async (weekStart: string) => {
      if (!user) return;
      setLeaderboardRefreshWeek(weekStart);
      setLeaderboardError(null);
      const response = await fetch(`/api/leaderboard?weekStart=${weekStart}`);
      if (!response.ok) {
        const message = await response.text();
        setLeaderboardError(
          message || "Unable to refresh leaderboard right now."
        );
        setLeaderboardRefreshWeek(null);
        return;
      }
      const data = (await response.json()) as {
        topEntries: LeaderboardEntry[];
      };
      setLeaderboards((prev) => ({
        ...prev,
        [weekStart]: data.topEntries ?? [],
      }));
      setLeaderboardRefreshWeek(null);
    },
    [user]
  );

  useEffect(() => {
    if (activeTab !== "leaderboard") return;
    if (
      expandedWeek &&
      (leaderboards[expandedWeek]?.length ?? 0) === 0 &&
      !leaderboardRequested[expandedWeek]
    ) {
      setLeaderboardRequested((prev) => ({ ...prev, [expandedWeek]: true }));
      refreshLeaderboardWeek(expandedWeek);
    }
  }, [
    activeTab,
    expandedWeek,
    leaderboards,
    refreshLeaderboardWeek,
    leaderboardRequested,
  ]);

  const saveUserTopics = async (updates: Partial<Record<string, unknown>>) => {
    if (!user) return;
    const userRef = doc(firestore, "users", user.uid);
    await setDoc(userRef, updates, { merge: true });
  };

  const updateSchedule = async (dateKey: string, topics: string[]) => {
    if (!user) return;
    const scheduleRef = doc(
      firestore,
      "users",
      user.uid,
      "topicSchedules",
      dateKey
    );
    if (topics.length === 0) {
      await deleteDoc(scheduleRef);
      setScheduleMap((prev) => {
        const next = { ...prev };
        delete next[dateKey];
        return next;
      });
      return;
    }

    await setDoc(
      scheduleRef,
      {
        topics,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
    setScheduleMap((prev) => ({ ...prev, [dateKey]: topics }));
  };

  const toggleTopic = (topics: string[], topic: string) => {
    if (topics.includes(topic)) {
      return topics.filter((value) => value !== topic);
    }
    return [...topics, topic];
  };

  const handleDefaultToggle = async (topic: string) => {
    const next = toggleTopic(topicDefaults, topic);
    setTopicDefaults(next);
    await saveUserTopics({ topicDefaults: next });
  };

  const handleAddTopic = async () => {
    const nextTopic = topicInput.trim();
    if (!nextTopic) return;
    if (availableTopics.includes(nextTopic)) {
      setTopicInput("");
      return;
    }
    const nextLibrary = [...topicLibrary, nextTopic];
    setTopicLibrary(nextLibrary);
    setTopicInput("");
    await saveUserTopics({ topicLibrary: nextLibrary });
  };

  const handleRemoveTopic = async (topic: string) => {
    const nextLibrary = topicLibrary.filter((value) => value !== topic);
    const nextDefaults = topicDefaults.filter((value) => value !== topic);
    setTopicLibrary(nextLibrary);
    setTopicDefaults(nextDefaults);
    await saveUserTopics({
      topicLibrary: nextLibrary,
      topicDefaults: nextDefaults,
    });

    await Promise.all(
      Object.entries(scheduleMap).map(([dateKey, topics]) => {
        const nextTopics = topics.filter((value) => value !== topic);
        return updateSchedule(dateKey, nextTopics);
      })
    );
  };

  const handleApplyDefaults = async () => {
    if (!user) return;
    const daysToApply = scheduleDays.slice(0, applyDays);
    const defaults = [...topicDefaults];
    setScheduleMap((prev) => {
      const next = { ...prev };
      daysToApply.forEach((day) => {
        next[day.dateKey] = defaults;
      });
      return next;
    });
    await Promise.all(
      daysToApply.map((day) => updateSchedule(day.dateKey, defaults))
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
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                Welcome back{user?.displayName ? `, ${user.displayName}` : ""}.
              </h1>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                {streakCount} day streak
              </span>
            </div>
          </div>
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:text-white dark:hover:border-slate-400"
            type="button"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 flex w-full flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-1 sm:rounded-full">
          {[
            { id: "questions", label: "Questions" },
            { id: "preferences", label: "Preferences" },
            { id: "leaderboard", label: "Leaderboard" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.id as "questions" | "preferences" | "leaderboard"
                )
              }
              className={`rounded-full px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
            {streakCount} day streak
          </span>
        </div>

        {activeTab === "questions" ? (
          <>
            <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Today&apos;s questions</h2>
                <button
                  className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-200"
                  onClick={() => fetchDailyQuiz(true)}
                  type="button"
                  disabled={
                    isRefreshing || quizState.loading || isCompletedToday
                  }
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
                            showResults &&
                            choiceIndex === question.answerIndex;
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
                      {submitError ? (
                        <p className="mt-2 text-sm text-rose-700 dark:text-rose-200">
                          {submitError}
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

            <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
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
                                {result.quiz.questions.map(
                                  (question, index) => {
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
                                                choiceIndex ===
                                                question.answerIndex;
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
                                  }
                                )}
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
          </>
        ) : activeTab === "preferences" ? (
          <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Focus topics</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Prioritize specific areas for the next five days of questions.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Defaults and schedules
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-1 py-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setApplyDays(value)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          applyDays === value
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                        }`}
                        aria-pressed={applyDays === value}
                      >
                        {value}d
                      </button>
                    ))}
                  </div>
                  <button
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    type="button"
                    onClick={handleApplyDefaults}
                    disabled={topicDefaults.length === 0}
                  >
                    Apply defaults
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Default topics
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableTopics.map((topic) => {
                    const isSelected = topicDefaults.includes(topic);
                    return (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => handleDefaultToggle(topic)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          isSelected
                            ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                            : "border-[color:var(--border)] text-slate-600 hover:border-slate-400 dark:text-slate-300"
                        }`}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
                {topicDefaults.length === 0 ? (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-200">
                    Pick at least one default topic to apply schedules.
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Custom topics
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none dark:text-slate-200"
                    placeholder="Add a topic (e.g., Sharding)"
                    value={topicInput}
                    onChange={(event) => setTopicInput(event.target.value)}
                  />
                  <button
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    type="button"
                    onClick={handleAddTopic}
                  >
                    Add topic
                  </button>
                </div>
                {topicLibrary.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topicLibrary.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => handleRemoveTopic(topic)}
                        className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs text-slate-600 hover:border-rose-400 hover:text-rose-600 dark:text-slate-300"
                        title="Remove topic"
                      >
                        {topic} ✕
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Add custom topics to personalize your focus areas.
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Next 5 days
                </p>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {scheduleDays.map((day) => {
                    const scheduledTopics =
                      scheduleMap[day.dateKey] ?? topicDefaults;
                    const usesDefault = !scheduleMap[day.dateKey];
                    return (
                      <div
                        key={day.dateKey}
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {day.label}
                          </p>
                          <button
                            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            type="button"
                            onClick={() => updateSchedule(day.dateKey, [])}
                            disabled={usesDefault}
                          >
                            Use defaults
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {availableTopics.map((topic) => {
                            const isSelected =
                              scheduledTopics?.includes(topic);
                            return (
                              <button
                                key={`${day.dateKey}-${topic}`}
                                type="button"
                                onClick={() =>
                                  updateSchedule(
                                    day.dateKey,
                                    toggleTopic(scheduledTopics ?? [], topic)
                                  )
                                }
                                className={`rounded-full border px-3 py-1 text-xs ${
                                  isSelected
                                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                                    : "border-[color:var(--border)] text-slate-600 hover:border-slate-400 dark:text-slate-300"
                                }`}
                              >
                                {topic}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : (
            <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Weekly leaderboard</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    You are placed{" "}
                    {(() => {
                      const currentEntries =
                        (expandedWeek
                          ? leaderboards[expandedWeek]
                          : leaderboards[currentWeekStart]) ?? [];
                      const rankIndex = currentEntries.findIndex(
                        (entry) => entry.uid === user?.uid
                      );
                      return rankIndex >= 0
                        ? `#${rankIndex + 1}`
                        : "—";
                    })()}{" "}
                    this week.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    GMT+8 (Singapore)
                  </span>
                  <div className="flex flex-wrap items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-1 py-1 text-xs">
                    {[10, 25, 50].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLeaderboardLimit(value)}
                        className={`rounded-full px-3 py-1 font-semibold ${
                          leaderboardLimit === value
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                        }`}
                        aria-pressed={leaderboardLimit === value}
                      >
                        Top {value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            {leaderboardLoading ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                Loading leaderboard...
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {leaderboardError ? (
                  <p className="text-sm text-rose-700 dark:text-rose-200">
                    {leaderboardError}
                  </p>
                ) : null}
                {visibleWeekStarts.map((weekStart) => {
                  const isOpen = expandedWeek === weekStart;
                  const entries = leaderboards[weekStart] ?? [];
                  const limitedEntries = entries.slice(0, leaderboardLimit);
                  const weekEnd = getWeekEndDateKey(
                    LEADERBOARD_TIMEZONE,
                    weekStart
                  );
                  return (
                    <div
                      key={weekStart}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]"
                    >
                        <button
                          type="button"
                          className="flex w-full flex-col items-start justify-between gap-2 px-4 py-3 text-left text-xs sm:flex-row sm:items-center sm:gap-4 sm:text-sm"
                          onClick={() => {
                            const nextOpen = !isOpen;
                            setExpandedWeek(nextOpen ? weekStart : null);
                            if (nextOpen && entries.length === 0) {
                              refreshLeaderboardWeek(weekStart);
                            }
                          }}
                        >
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Week of {formatDateKey(weekStart)} –{" "}
                          {formatDateKey(weekEnd)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {isOpen ? "Hide" : "View"}
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="border-t border-[color:var(--border)] px-4 py-4">
                            {limitedEntries.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {leaderboardRefreshWeek === weekStart
                                  ? "Loading leaderboard..."
                                  : "No results yet for this week."}
                            </p>
                          ) : (
                            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                              {limitedEntries.map((entry, index) => (
                                <div
                                  key={entry.uid}
                                  className="grid gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-2 sm:flex sm:items-center sm:justify-between"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="w-5 text-xs text-slate-400">
                                      {index + 1}
                                    </span>
                                    <span className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-xs font-semibold text-slate-600 dark:text-slate-200">
                                      {(entry.displayName ??
                                        entry.email ??
                                        "A")
                                        .split(" ")
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((part) =>
                                          part[0]?.toUpperCase()
                                        )
                                        .join("")}
                                    </span>
                                    <span className="font-medium">
                                      {entry.displayName ||
                                        entry.email ||
                                        "Anonymous"}
                                    </span>
                                  </div>
                                    <span className="text-sm text-slate-600 dark:text-slate-300 sm:text-base">
                                    {entry.correct}/{entry.total}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => refreshLeaderboardWeek(weekStart)}
                                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                disabled={leaderboardRefreshWeek === weekStart}
                              >
                                {leaderboardRefreshWeek === weekStart
                                  ? "Refreshing..."
                                  : "Refresh"}
                              </button>
                            </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
