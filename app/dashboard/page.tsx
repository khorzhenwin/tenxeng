"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  deleteDoc,
  limit,
  orderBy,
  query,
  startAfter,
  setDoc,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Query,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { firebaseAuth, firestore } from "@/lib/firebase/client";
import { clearSession } from "@/lib/auth/client";
import { useAuth } from "@/components/AuthProvider";
import type {
  DailyQuiz,
  PracticeSession,
  PracticeSourceType,
  ProgressTrendsPayload,
  QuizResult,
  QuizReviewItem,
  QuizReviewSession,
  WeakTopicSignal,
} from "@/lib/quiz/types";
import {
  getDateKeyForTimezone,
  getYearWeekStartsUntilDate,
  getWeekEndDateKey,
  getWeekStartDateKey,
  parseDateKeyToDate,
  addDays,
} from "@/lib/quiz/date";
import { useUiStore } from "@/lib/store/ui";
import PvpPanel from "@/components/PvpPanel";
import SocialPanel from "@/components/SocialPanel";
import ChatBubble from "@/components/ChatBubble";

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

type TopicStat = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
};

type PvpHistorySummaryEntry = {
  outcome?: "win" | "loss" | "draw";
};

type SocialSummaryResponse = {
  friends?: unknown[];
};

type ReviewTopicGroup = {
  topic: string;
  items: QuizReviewItem[];
};

const EMPTY_PROGRESS_TRENDS: ProgressTrendsPayload = {
  summary: {
    completedQuizzes: 0,
    completedPracticeSessions: 0,
    averageQuizAccuracy: null,
    averagePracticeAccuracy: null,
  },
  quizSeries: [],
  practiceSeries: [],
  weakTopics: [],
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
const MAX_STATS_RESULTS = 365;
const STATS_BATCH_SIZE = 60;

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [progressTrends, setProgressTrends] =
    useState<ProgressTrendsPayload>(EMPTY_PROGRESS_TRENDS);
  const [trendsInitialized, setTrendsInitialized] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSession[]>([]);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceCreatingSource, setPracticeCreatingSource] =
    useState<PracticeSourceType | null>(null);
  const [practiceSubmitting, setPracticeSubmitting] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [practiceSubmitError, setPracticeSubmitError] = useState<string | null>(null);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, number>>({});
  const [expandedPracticeSessionId, setExpandedPracticeSessionId] = useState<
    string | null
  >(null);
  const [reviewSessions, setReviewSessions] = useState<QuizReviewSession[]>([]);
  const [reviewInitialized, setReviewInitialized] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewLoadingMore, setReviewLoadingMore] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNextCursor, setReviewNextCursor] = useState<string | null>(null);
  const [reviewedThisVisitCount, setReviewedThisVisitCount] = useState(0);
  const [reviewMutatingIds, setReviewMutatingIds] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedReviewTopics, setExpandedReviewTopics] = useState<
    Record<string, boolean>
  >({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [topicDefaults, setTopicDefaults] = useState<string[]>(DEFAULT_TOPICS);
  const [topicLibrary, setTopicLibrary] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [scheduleMap, setScheduleMap] = useState<Record<string, string[]>>({});
  const applyDays = useUiStore((state) => state.applyDays);
  const setApplyDays = useUiStore((state) => state.setApplyDays);
  const [timezone, setTimezone] = useState("UTC");
  const activeTab = useUiStore((state) => state.activeTab);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaderboards, setLeaderboards] = useState<
    Record<string, LeaderboardEntry[]>
  >({});
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const leaderboardLimit = useUiStore((state) => state.leaderboardLimit);
  const setLeaderboardLimit = useUiStore(
    (state) => state.setLeaderboardLimit
  );
  const [leaderboardRefreshWeek, setLeaderboardRefreshWeek] = useState<
    string | null
  >(null);
  const [leaderboardScope, setLeaderboardScope] = useState<"global" | "friends">(
    "global"
  );
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardRequested, setLeaderboardRequested] = useState<
    Record<string, boolean>
  >({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [topicStats, setTopicStats] = useState<TopicStat[]>([]);
  const [pvpSummary, setPvpSummary] = useState({ won: 0, lost: 0 });
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const backfillRequested = useRef<Set<string>>(new Set());
  const statsInFlight = useRef(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const pvpSessionId = useMemo(() => {
    const value = searchParams.get("pvpSession");
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);
  const asyncMatchId = useMemo(() => {
    const value = searchParams.get("asyncMatch");
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);
  const openPvpSession = useCallback(
    (targetSessionId: string) => {
      setActiveTab("pvp");
      router.replace(`/dashboard?pvpSession=${targetSessionId}`);
    },
    [router, setActiveTab]
  );
  const openAsyncMatch = useCallback(
    (targetMatchId: string) => {
      setActiveTab("pvp");
      router.replace(`/dashboard?asyncMatch=${targetMatchId}`);
    },
    [router, setActiveTab]
  );
  const maskEmail = useCallback((email?: string | null) => {
    if (!email) return null;
    if (email.length <= 8) return email;
    return `${email.slice(0, 4)}${"*".repeat(email.length - 8)}${email.slice(
      -4
    )}`;
  }, []);
  const truncateLabel = useCallback((label: string, max = 15) => {
    if (label.length <= max) return label;
    return `${label.slice(0, Math.max(0, max - 3))}...`;
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (pvpSessionId || asyncMatchId) {
      setActiveTab("pvp");
    }
  }, [asyncMatchId, pvpSessionId, setActiveTab]);

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

  const loadProgressTrends = useCallback(async () => {
    if (!user) return;
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const response = await fetch("/api/progress-trends");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load progress trends.");
      }

      const data = (await response.json()) as ProgressTrendsPayload;
      setProgressTrends({
        summary: data.summary ?? EMPTY_PROGRESS_TRENDS.summary,
        quizSeries: Array.isArray(data.quizSeries) ? data.quizSeries : [],
        practiceSeries: Array.isArray(data.practiceSeries) ? data.practiceSeries : [],
        weakTopics: Array.isArray(data.weakTopics) ? data.weakTopics : [],
      });
      setTrendsInitialized(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load progress trends.";
      setTrendsError(message);
    } finally {
      setTrendsLoading(false);
    }
  }, [user]);

  const loadPracticeSessions = useCallback(async () => {
    if (!user) return;
    setPracticeLoading(true);
    setPracticeError(null);
    try {
      const response = await fetch("/api/practice-quiz?limit=10");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load practice history.");
      }

      const data = (await response.json()) as { sessions?: PracticeSession[] };
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      setPracticeSessions(sessions);
      setPracticeSession((prev) => {
        if (prev) {
          return sessions.find((session) => session.id === prev.id) ?? prev;
        }
        return sessions.find((session) => session.status === "ready") ?? null;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load practice history.";
      setPracticeError(message);
    } finally {
      setPracticeLoading(false);
    }
  }, [user]);

  const startPracticeSession = useCallback(
    async (
      sourceType: PracticeSourceType,
      options?: { activatePracticeTab?: boolean }
    ) => {
      setPracticeError(null);
      setPracticeSubmitError(null);
      setPracticeCreatingSource(sourceType);
      try {
        const response = await fetch("/api/practice-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceType }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to start practice drill.");
        }

        const data = (await response.json()) as { session: PracticeSession };
        setPracticeSession(data.session);
        setPracticeAnswers({});
        setPracticeSessions((prev) => [
          data.session,
          ...prev.filter((session) => session.id !== data.session.id),
        ]);
        setExpandedPracticeSessionId(data.session.id);
        if (options?.activatePracticeTab) {
          setActiveTab("practice");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to start practice drill.";
        setPracticeError(message);
      } finally {
        setPracticeCreatingSource(null);
      }
    },
    [setActiveTab]
  );

  const submitPracticeSession = useCallback(async () => {
    if (!practiceSession || practiceSession.status === "completed") {
      return;
    }

    setPracticeSubmitError(null);
    setPracticeSubmitting(true);
    try {
      const response = await fetch("/api/practice-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: practiceSession.id,
          selectedAnswers: practiceAnswers,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to submit practice drill.");
      }

      const data = (await response.json()) as { session: PracticeSession };
      setPracticeSession(data.session);
      setPracticeSessions((prev) => [
        data.session,
        ...prev.filter((session) => session.id !== data.session.id),
      ]);
      if (trendsInitialized) {
        await loadProgressTrends();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit practice drill.";
      setPracticeSubmitError(message);
    } finally {
      setPracticeSubmitting(false);
    }
  }, [loadProgressTrends, practiceAnswers, practiceSession, trendsInitialized]);

  const loadReviewSessions = useCallback(async (options?: { append?: boolean }) => {
    if (!user) return;
    const append = options?.append ?? false;
    const cursor = append ? reviewNextCursor : null;
    if (append && !cursor) {
      return;
    }

    setReviewError(null);
    if (append) {
      setReviewLoadingMore(true);
    } else {
      setReviewLoading(true);
    }

    try {
      const params = new URLSearchParams({ limit: "4" });
      if (cursor) {
        params.set("cursor", cursor);
      }
      const response = await fetch(`/api/quiz-review?${params.toString()}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load review sessions.");
      }
      const data = (await response.json()) as {
        sessions?: QuizReviewSession[];
        nextCursor?: string | null;
      };
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      setReviewSessions((prev) => (append ? [...prev, ...sessions] : sessions));
      setReviewNextCursor(
        typeof data.nextCursor === "string" ? data.nextCursor : null
      );
      setReviewInitialized(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load review sessions.";
      setReviewError(message);
    } finally {
      if (append) {
        setReviewLoadingMore(false);
      } else {
        setReviewLoading(false);
      }
    }
  }, [reviewNextCursor, user]);

  const markReviewItem = useCallback(async (itemId: string) => {
    setReviewError(null);
    setReviewMutatingIds((prev) => ({ ...prev, [itemId]: true }));
    try {
      const response = await fetch("/api/quiz-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to mark mistake as reviewed.");
      }

      setReviewSessions((prev) =>
        prev
          .map((session) => {
            const nextItems = session.items.filter((item) => item.id !== itemId);
            return {
              ...session,
              items: nextItems,
              mistakeCount: nextItems.length,
            };
          })
          .filter((session) => session.items.length > 0)
      );
      setReviewedThisVisitCount((prev) => prev + 1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to mark mistake as reviewed.";
      setReviewError(message);
    } finally {
      setReviewMutatingIds((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }, []);

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

  useEffect(() => {
    if (!user) return;
    const ping = () => {
      fetch("/api/presence/ping", { method: "POST" }).catch(() => undefined);
    };
    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProgressTrends(EMPTY_PROGRESS_TRENDS);
      setTrendsInitialized(false);
      setTrendsError(null);
      setPracticeSessions([]);
      setPracticeSession(null);
      setPracticeError(null);
      setPracticeSubmitError(null);
      setPracticeAnswers({});
      setExpandedPracticeSessionId(null);
      setReviewSessions([]);
      setReviewInitialized(false);
      setReviewNextCursor(null);
      setReviewError(null);
      setReviewedThisVisitCount(0);
      setReviewMutatingIds({});
      setExpandedReviewTopics({});
      return;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (activeTab !== "trends") return;
    if (trendsInitialized || trendsLoading) return;
    void loadProgressTrends();
  }, [activeTab, loadProgressTrends, trendsInitialized, trendsLoading, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (activeTab !== "review") return;
    if (reviewInitialized) return;
    void loadReviewSessions();
  }, [activeTab, loadReviewSessions, reviewInitialized, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (activeTab !== "practice") return;
    if (practiceSessions.length > 0) return;
    void loadPracticeSessions();
  }, [activeTab, loadPracticeSessions, practiceSessions.length, user]);

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
  const profileSummary = useMemo(() => {
    return history.reduce(
      (acc, entry) => {
        acc.total += entry.total ?? 0;
        acc.correct += entry.score ?? 0;
        return acc;
      },
      { total: 0, correct: 0 }
    );
  }, [history]);
  const wrongAnswers = Math.max(0, profileSummary.total - profileSummary.correct);
  const correctRatio =
    profileSummary.total > 0 ? profileSummary.correct / profileSummary.total : 0;
  const wrongRatio = profileSummary.total > 0 ? wrongAnswers / profileSummary.total : 0;
  const yearWeekStarts = useMemo(
    () => getYearWeekStartsUntilDate(LEADERBOARD_TIMEZONE),
    []
  );
  const currentWeekStart = useMemo(
    () => getWeekStartDateKey(LEADERBOARD_TIMEZONE),
    []
  );
  const visibleWeekStarts = useMemo(
    () =>
      yearWeekStarts.filter((weekStart) => weekStart <= currentWeekStart),
    [yearWeekStarts, currentWeekStart]
  );
  const practiceQuestionCount = practiceSession?.questions.length ?? 0;
  const hasAnsweredAllPractice = useMemo(() => {
    if (!practiceSession || practiceSession.status === "completed") {
      return false;
    }
    return practiceSession.questions.every((question) =>
      Object.prototype.hasOwnProperty.call(practiceAnswers, question.id)
    );
  }, [practiceAnswers, practiceSession]);
  const practiceDisplayAnswers =
    practiceSession?.status === "completed"
      ? practiceSession.selectedAnswers
      : practiceAnswers;
  const hasProgressTrendData =
    progressTrends.quizSeries.length > 0 ||
    progressTrends.practiceSeries.length > 0 ||
    progressTrends.weakTopics.length > 0;
  const isProgressTrendsFirstLoad = trendsLoading && !trendsInitialized;
  const reviewTopicGroups = useMemo<ReviewTopicGroup[]>(() => {
    const topicMap = new Map<string, QuizReviewItem[]>();
    reviewSessions.forEach((session) => {
      session.items.forEach((item) => {
        const existing = topicMap.get(item.primaryTopic) ?? [];
        existing.push(item);
        topicMap.set(item.primaryTopic, existing);
      });
    });

    return Array.from(topicMap.entries())
      .map(([topic, items]) => ({
        topic,
        items: [...items].sort((left, right) => {
          if (right.completedAt !== left.completedAt) {
            return right.completedAt.localeCompare(left.completedAt);
          }
          return left.prompt.localeCompare(right.prompt);
        }),
      }))
      .sort((left, right) => {
        if (right.items.length !== left.items.length) {
          return right.items.length - left.items.length;
        }
        return left.topic.localeCompare(right.topic);
      });
  }, [reviewSessions]);
  const totalVisibleReviewItems = useMemo(
    () => reviewTopicGroups.reduce((sum, group) => sum + group.items.length, 0),
    [reviewTopicGroups]
  );
  const expandedReviewItemCount = useMemo(
    () =>
      reviewTopicGroups.reduce(
        (sum, group) =>
          sum + (expandedReviewTopics[group.topic] ? group.items.length : 0),
        0
      ),
    [expandedReviewTopics, reviewTopicGroups]
  );
  const expandedReviewTopicCount = useMemo(
    () =>
      reviewTopicGroups.filter((group) => expandedReviewTopics[group.topic]).length,
    [expandedReviewTopics, reviewTopicGroups]
  );
  const hasVisibleReviewItems = reviewTopicGroups.length > 0;

  useEffect(() => {
    setExpandedReviewTopics((prev) => {
      if (reviewTopicGroups.length === 0) {
        return Object.keys(prev).length === 0 ? prev : {};
      }

      const next: Record<string, boolean> = {};
      let changed = false;
      const hadExpandedTopic = Object.values(prev).some(Boolean);

      reviewTopicGroups.forEach((group) => {
        if (Object.prototype.hasOwnProperty.call(prev, group.topic)) {
          next[group.topic] = prev[group.topic];
        } else {
          next[group.topic] = false;
          changed = true;
        }
      });

      Object.keys(prev).forEach((topic) => {
        if (!reviewTopicGroups.some((group) => group.topic === topic)) {
          changed = true;
        }
      });

      const hasExpandedTopic = Object.values(next).some(Boolean);
      if ((!hasExpandedTopic && hadExpandedTopic) || Object.keys(prev).length === 0) {
        next[reviewTopicGroups[0].topic] = true;
        if (prev[reviewTopicGroups[0].topic] !== true) {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [reviewTopicGroups]);

  const toggleReviewTopic = useCallback((topic: string) => {
    setExpandedReviewTopics((prev) => ({
      ...prev,
      [topic]: !(prev[topic] ?? false),
    }));
  }, []);
  const expandAllReviewTopics = useCallback(() => {
    setExpandedReviewTopics(
      Object.fromEntries(reviewTopicGroups.map((group) => [group.topic, true]))
    );
  }, [reviewTopicGroups]);
  const collapseAllReviewTopics = useCallback(() => {
    setExpandedReviewTopics(
      Object.fromEntries(reviewTopicGroups.map((group) => [group.topic, false]))
    );
  }, [reviewTopicGroups]);

  const handleSelect = (questionId: string, choiceIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
  };

  const handlePracticeSelect = (questionId: string, choiceIndex: number) => {
    setPracticeAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
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
      await fetchHistory();
      if (trendsInitialized) {
        await loadProgressTrends();
      }
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

  function formatPracticeSource(sourceType: PracticeSourceType) {
    if (sourceType === "weak-topics") {
      return "Practice weak topics";
    }
    return "Practice recent mistakes";
  }

  function formatTimestamp(value: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
  }

  function formatPercent(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "—";
    }
    return `${Math.round(value * 100)}%`;
  }

  function getTopicBarWidth(signal: WeakTopicSignal) {
    const pressure = signal.wrong * 0.12 + (1 - signal.accuracy);
    return `${Math.max(18, Math.min(100, Math.round(pressure * 100)))}%`;
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

      if (leaderboardScope === "global") {
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
      } else {
        await Promise.all(
          visibleWeekStarts.map(async (weekStart) => {
            const response = await fetch(
              `/api/leaderboard?weekStart=${weekStart}&scope=friends`
            );
            if (!response.ok) {
              entriesByWeek[weekStart] = [];
              return;
            }
            const data = (await response.json()) as { topEntries: LeaderboardEntry[] };
            entriesByWeek[weekStart] = data.topEntries ?? [];
          })
        );
      }

      setLeaderboards(entriesByWeek);
      setLeaderboardLoading(false);
    };

    loadLeaderboards();
  }, [user, visibleWeekStarts, activeTab, leaderboardScope]);

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
      const response = await fetch(
        `/api/leaderboard?weekStart=${weekStart}&scope=${leaderboardScope}`
      );
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
    [user, leaderboardScope]
  );

  useEffect(() => {
    if (activeTab !== "leaderboard") return;
    if (
      expandedWeek &&
      (leaderboards[expandedWeek]?.length ?? 0) < leaderboardLimit &&
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
    leaderboardLimit,
  ]);


  const loadStats = useCallback(async () => {
    if (!user) return;
    if (statsInFlight.current) return;
    statsInFlight.current = true;
    setStatsLoading(true);
    try {
      const [pvpSummaryResponse, socialSummaryResponse] = await Promise.allSettled([
        fetch("/api/pvp/history"),
        fetch("/api/friends"),
      ]);

      if (
        pvpSummaryResponse.status === "fulfilled" &&
        pvpSummaryResponse.value.ok
      ) {
        const payload = (await pvpSummaryResponse.value.json()) as {
          history?: PvpHistorySummaryEntry[];
        };
        const summary = (payload.history ?? []).reduce(
          (acc, entry) => {
            if (entry.outcome === "win") acc.won += 1;
            if (entry.outcome === "loss") acc.lost += 1;
            return acc;
          },
          { won: 0, lost: 0 }
        );
        setPvpSummary(summary);
      }

      if (
        socialSummaryResponse.status === "fulfilled" &&
        socialSummaryResponse.value.ok
      ) {
        const payload = (await socialSummaryResponse.value.json()) as SocialSummaryResponse;
        setFriendCount(Array.isArray(payload.friends) ? payload.friends.length : 0);
      } else if (
        socialSummaryResponse.status === "fulfilled" &&
        socialSummaryResponse.value.status === 429
      ) {
        // /api/friends is rate-limited; retry once to avoid showing a stale/false zero.
        await new Promise((resolve) => setTimeout(resolve, 350));
        const retryResponse = await fetch("/api/friends");
        if (retryResponse.ok) {
          const retryPayload = (await retryResponse.json()) as SocialSummaryResponse;
          setFriendCount(
            Array.isArray(retryPayload.friends) ? retryPayload.friends.length : 0
          );
        }
      }

      const resultsRef = collection(
        firestore,
        "users",
        user.uid,
        "quizResults"
      );
      const results: QuizResult[] = [];
      let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      while (results.length < MAX_STATS_RESULTS) {
        const batchLimit = Math.min(
          STATS_BATCH_SIZE,
          MAX_STATS_RESULTS - results.length
        );
        let batchQuery: Query<DocumentData>;
        if (lastDoc) {
          batchQuery = query(
            resultsRef,
            orderBy("completedAt", "desc"),
            startAfter(lastDoc),
            limit(batchLimit)
          );
        } else {
          batchQuery = query(
            resultsRef,
            orderBy("completedAt", "desc"),
            limit(batchLimit)
          );
        }
        const resultsSnap = await getDocs(batchQuery);
        results.push(
          ...resultsSnap.docs.map((docSnap) => docSnap.data() as QuizResult)
        );
        if (resultsSnap.docs.length < batchLimit) break;
        lastDoc = resultsSnap.docs[resultsSnap.docs.length - 1] ?? null;
      }

      const quizDocs = await Promise.all(
        results.map((result) =>
          getDoc(
            doc(firestore, "users", user.uid, "dailyQuizzes", result.dateKey)
          )
        )
      );

      const totals = new Map<string, { correct: number; total: number }>();
      const backfillDateKeys: string[] = [];
      quizDocs.forEach((quizSnap, index) => {
        if (!quizSnap.exists()) return;
        const quiz = quizSnap.data() as DailyQuiz;
        if (!quiz.questions || quiz.questions.length === 0) return;
        const result = results[index];
        quiz.questions.forEach((question) => {
          if (!question.topics || question.topics.length === 0) {
            backfillDateKeys.push(result.dateKey);
            return;
          }
          const isCorrect =
            result.selectedAnswers[question.id] === question.answerIndex;
          question.topics.forEach((topic) => {
            const entry = totals.get(topic) ?? { correct: 0, total: 0 };
            entry.correct += isCorrect ? 1 : 0;
            entry.total += 1;
            totals.set(topic, entry);
          });
        });
      });

      const computed = Array.from(totals.entries())
        .map(([topic, entry]) => ({
          topic,
          correct: entry.correct,
          total: entry.total,
          accuracy: entry.total > 0 ? entry.correct / entry.total : 0,
        }))
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 8);

      setTopicStats(computed);
      setStatsLoading(false);

      const uniqueBackfills = Array.from(new Set(backfillDateKeys));
      const pendingBackfills = uniqueBackfills.filter(
        (dateKey) => !backfillRequested.current.has(dateKey)
      );
      if (pendingBackfills.length > 0) {
        setBackfillLoading(true);
        pendingBackfills.forEach((dateKey) =>
          backfillRequested.current.add(dateKey)
        );
        for (let i = 0; i < pendingBackfills.length; i += 30) {
          const batch = pendingBackfills.slice(i, i + 30);
          await fetch("/api/quiz-topics/backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dateKeys: batch }),
          });
        }
        setBackfillLoading(false);
        setTimeout(() => {
          loadStats();
        }, 0);
      }
    } finally {
      statsInFlight.current = false;
      setStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab !== "profile") return;
    if (topicStats.length === 0 && !statsLoading) {
      loadStats();
    }
  }, [activeTab, topicStats, statsLoading, loadStats]);

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

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-transparent text-[color:var(--foreground)]">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-12 sm:px-6">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-4 text-sm text-slate-500 shadow-sm dark:text-slate-300">
            Loading dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-[color:var(--foreground)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 sm:text-sm">
              Daily System Design Quiz
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl">
                Welcome back{user?.displayName ? `, ${user.displayName}` : ""}.
              </h1>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-200">
                {streakCount} day streak
              </span>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`w-full rounded-full border px-4 py-2 text-sm font-semibold sm:w-auto ${
                activeTab === "profile"
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-slate-300 text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:text-white dark:hover:border-slate-400"
              }`}
            >
              My Profile
            </button>
            <button
              className="w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:text-white dark:hover:border-slate-400 sm:w-auto"
              type="button"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-6 flex w-full flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-1 sm:mt-8 sm:rounded-full">
          {[
            { id: "questions", label: "Questions" },
            { id: "trends", label: "Progress trends" },
            { id: "practice", label: "Practice" },
            { id: "review", label: "Mistake inbox" },
            { id: "preferences", label: "Preferences" },
            { id: "leaderboard", label: "Leaderboard" },
            { id: "pvp", label: "PvP" },
            { id: "social", label: "Social" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.id as
                    | "questions"
                    | "trends"
                    | "practice"
                    | "review"
                    | "preferences"
                    | "leaderboard"
                    | "pvp"
                    | "social"
                )
              }
              className={`rounded-full px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
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
        ) : activeTab === "trends" ? (
          <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Progress trends</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  See whether quiz accuracy is improving, how often you are practicing, and which topics still need attention.
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                type="button"
                onClick={() => loadProgressTrends()}
                disabled={trendsLoading}
                aria-busy={trendsLoading}
              >
                {trendsLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent dark:border-slate-400 dark:border-t-transparent" />
                ) : null}
                Refresh
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {isProgressTrendsFirstLoad
                ? Array.from({ length: 4 }, (_, index) => (
                    <div
                      key={`trends-skeleton-${index + 1}`}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                    >
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                      <div className="mt-4 h-8 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    </div>
                  ))
                : [
                    {
                      label: "Quizzes tracked",
                      value: progressTrends.summary.completedQuizzes,
                    },
                    {
                      label: "Practice sessions",
                      value: progressTrends.summary.completedPracticeSessions,
                    },
                    {
                      label: "Recent quiz accuracy",
                      value: formatPercent(progressTrends.summary.averageQuizAccuracy),
                    },
                    {
                      label: "Recent practice accuracy",
                      value: formatPercent(progressTrends.summary.averagePracticeAccuracy),
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                          {stat.value}
                        </p>
                        {trendsLoading && trendsInitialized ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Updating...
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
            </div>

            {trendsError ? (
              <p className="mt-6 text-sm text-rose-700 dark:text-rose-200">
                {trendsError}
              </p>
            ) : isProgressTrendsFirstLoad ? (
              <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                Loading progress trends...
              </p>
            ) : !hasProgressTrendData ? (
              <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-5 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  Complete a few quizzes or drills and this area will start showing momentum, practice cadence, and topics that still need work.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("questions")}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    Go to today&apos;s quiz
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("review")}
                    className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                  >
                    Open mistake inbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("practice")}
                    className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                  >
                    Open practice
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                  Mistake inbox shows what you missed recently. Progress trends shows whether your quiz accuracy and practice habit are improving over time.
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Recent quiz accuracy
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Your latest scored quizzes in chronological order.
                          </p>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {progressTrends.quizSeries.length} results
                        </span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {progressTrends.quizSeries.slice(-8).map((point) => (
                          <div key={`quiz-${point.dateKey}`} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {formatDateKey(point.dateKey)}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {point.score}/{point.total} correct
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.round(point.accuracy * 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Accuracy {formatPercent(point.accuracy)}
                            </p>
                          </div>
                        ))}
                        {progressTrends.quizSeries.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            No completed quizzes yet.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Practice cadence
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Track how often you are drilling and how those sessions are landing.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("practice")}
                          className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                        >
                          Open practice
                        </button>
                      </div>

                      <div className="mt-5 space-y-3">
                        {progressTrends.practiceSeries.slice(-8).map((point) => (
                          <div
                            key={`practice-${point.dateKey}`}
                            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                  {formatDateKey(point.dateKey)}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {point.completedCount} session{point.completedCount === 1 ? "" : "s"} completed
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatPercent(point.averageAccuracy)}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Avg. accuracy
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {progressTrends.practiceSeries.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            No completed practice sessions yet.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Topics needing attention
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            A blended view of recent quiz misses and completed practice performance.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("review")}
                          className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                        >
                          Open mistake inbox
                        </button>
                      </div>

                      <div className="mt-5 space-y-3">
                        {progressTrends.weakTopics.map((signal) => (
                          <div
                            key={signal.topic}
                            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                  {signal.topic}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {signal.wrong} miss{signal.wrong === 1 ? "" : "es"} across {signal.total} question{signal.total === 1 ? "" : "s"}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                {formatPercent(signal.accuracy)}
                              </p>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: getTopicBarWidth(signal) }}
                              />
                            </div>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                              Latest signal {formatTimestamp(signal.latestCompletedAt)}
                            </p>
                          </div>
                        ))}
                        {progressTrends.weakTopics.length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            No obvious weak topics right now. Keep taking quizzes and drills to build a clearer pattern.
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            startPracticeSession("weak-topics", {
                              activatePracticeTab: true,
                            })
                          }
                          disabled={practiceCreatingSource !== null}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                        >
                          {practiceCreatingSource === "weak-topics"
                            ? "Generating..."
                            : "Practice weak topics"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("questions")}
                          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                        >
                          Take today&apos;s quiz
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : activeTab === "practice" ? (
          <>
            <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Adaptive practice drills</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Generate a fresh 5-question drill from your weak areas or recent mistakes without affecting streaks or leaderboard standing.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startPracticeSession("weak-topics")}
                    disabled={practiceCreatingSource !== null}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {practiceCreatingSource === "weak-topics"
                      ? "Generating..."
                      : "Practice weak topics"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startPracticeSession("recent-mistakes")}
                    disabled={practiceCreatingSource !== null}
                    className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                  >
                    {practiceCreatingSource === "recent-mistakes"
                      ? "Generating..."
                      : "Practice recent mistakes"}
                  </button>
                </div>
              </div>

              {practiceError ? (
                <p className="mt-4 text-sm text-rose-700 dark:text-rose-200">
                  {practiceError}
                </p>
              ) : null}

              {practiceSession ? (
                <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {formatPracticeSource(practiceSession.sourceType)}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {practiceSession.status === "completed"
                          ? "Latest completed practice"
                          : "Current practice session"}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Started {formatTimestamp(practiceSession.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {practiceQuestionCount} questions
                      </span>
                      <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-200">
                        {practiceSession.status === "completed"
                          ? `${practiceSession.score}/${practiceSession.total}`
                          : "In progress"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {practiceSession.topics.map((topic) => (
                      <span
                        key={`${practiceSession.id}-${topic}`}
                        className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs text-slate-600 dark:text-slate-300"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 space-y-5">
                    {practiceSession.questions.map((question, index) => (
                      <div
                        key={question.id}
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                          Practice question {index + 1}
                        </p>
                        <p className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">
                          {question.prompt}
                        </p>
                        <div className="mt-4 grid gap-2 text-sm">
                          {question.choices.map((choice, choiceIndex) => {
                            const isCorrect =
                              practiceSession.status === "completed" &&
                              choiceIndex === question.answerIndex;
                            const isSelected =
                              practiceDisplayAnswers[question.id] === choiceIndex;
                            const isWrong =
                              practiceSession.status === "completed" &&
                              isSelected &&
                              choiceIndex !== question.answerIndex;

                            return (
                              <button
                                key={`${question.id}-${choiceIndex}`}
                                type="button"
                                onClick={() =>
                                  practiceSession.status !== "completed" &&
                                  handlePracticeSelect(question.id, choiceIndex)
                                }
                                className={`rounded-xl border px-4 py-3 text-left ${
                                  isCorrect
                                    ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                                    : isWrong
                                    ? "border-rose-400/60 bg-rose-400/10 text-rose-700 dark:text-rose-200"
                                    : isSelected
                                    ? "border-slate-400 bg-[color:var(--surface-muted)] text-slate-900 dark:text-slate-100"
                                    : "border-[color:var(--border)] bg-[color:var(--surface)] text-slate-700 hover:border-slate-400 dark:text-slate-200"
                                }`}
                              >
                                {choice}
                              </button>
                            );
                          })}
                        </div>
                        {practiceSession.status === "completed" ? (
                          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                            Explanation: {question.explanation}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      {practiceSession.status === "completed" ? (
                        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          Score: {practiceSession.score}/{practiceSession.total}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Complete all questions to submit this drill.
                        </p>
                      )}
                      {practiceSubmitError ? (
                        <p className="mt-2 text-sm text-rose-700 dark:text-rose-200">
                          {practiceSubmitError}
                        </p>
                      ) : null}
                    </div>
                    {practiceSession.status === "completed" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPracticeSession(null)}
                          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                        >
                          Close session
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={submitPracticeSession}
                        disabled={!hasAnsweredAllPractice || practiceSubmitting}
                        className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                      >
                        {practiceSubmitting ? "Submitting..." : "Submit practice"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-5 text-sm text-slate-600 dark:text-slate-300">
                  Start a targeted drill to practice weak areas without touching your daily quiz progress.
                </div>
              )}
            </section>

            <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Practice history</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Review recent drills separately from your daily quiz history.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadPracticeSessions()}
                  disabled={practiceLoading}
                  className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                >
                  {practiceLoading ? "Refreshing..." : "Refresh history"}
                </button>
              </div>

              {practiceLoading && practiceSessions.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                  Loading practice history...
                </p>
              ) : practiceSessions.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                  No practice sessions yet.
                </p>
              ) : (
                <div className="mt-6 space-y-3">
                  {practiceSessions.map((session) => {
                    const isExpanded = expandedPracticeSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPracticeSessionId((prev) =>
                              prev === session.id ? null : session.id
                            )
                          }
                          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                        >
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                              {formatPracticeSource(session.sourceType)}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {formatTimestamp(session.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span>
                              {session.status === "completed"
                                ? `${session.score}/${session.total}`
                                : "In progress"}
                            </span>
                            <span>{isExpanded ? "Hide" : "View"}</span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="space-y-4 border-t border-[color:var(--border)] px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {session.topics.map((topic) => (
                                <span
                                  key={`${session.id}-${topic}`}
                                  className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs text-slate-600 dark:text-slate-300"
                                >
                                  {topic}
                                </span>
                              ))}
                            </div>
                            {session.questions.map((question, index) => {
                              const selected = session.selectedAnswers[question.id];
                              return (
                                <div
                                  key={question.id}
                                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                                >
                                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                                    Practice question {index + 1}
                                  </p>
                                  <p className="mt-2 text-sm text-slate-900 dark:text-slate-100">
                                    {question.prompt}
                                  </p>
                                  <div className="mt-3 grid gap-2 text-sm">
                                    {question.choices.map((choice, choiceIndex) => {
                                      const isCorrect = choiceIndex === question.answerIndex;
                                      const isSelected = choiceIndex === selected;
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
                                    })}
                                  </div>
                                  {session.status === "completed" ? (
                                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                      Explanation: {question.explanation}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : activeTab === "review" ? (
          <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Mistake inbox</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Your recent backlog of missed questions from completed quizzes. Clear items here when you have looked at them once; use Progress trends to spot patterns over time.
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                type="button"
                onClick={() => loadReviewSessions()}
                disabled={reviewLoading || reviewLoadingMore}
                aria-busy={reviewLoading || reviewLoadingMore}
              >
                {reviewLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent dark:border-slate-400 dark:border-t-transparent" />
                ) : null}
                Refresh
              </button>
            </div>

            {!reviewLoading && !reviewError ? (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Inbox topics",
                      value: reviewTopicGroups.length,
                    },
                    {
                      label: "Inbox items",
                      value: totalVisibleReviewItems,
                    },
                    {
                      label: "Expanded now",
                      value: expandedReviewItemCount,
                    },
                    {
                      label: "Cleared this visit",
                      value: reviewedThisVisitCount,
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                {hasVisibleReviewItems ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={expandAllReviewTopics}
                      className="rounded-full border border-[color:var(--border)] px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                    >
                      Expand all topics
                    </button>
                    <button
                      type="button"
                      onClick={collapseAllReviewTopics}
                      className="rounded-full border border-[color:var(--border)] px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                    >
                      Collapse all topics
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {expandedReviewTopicCount} of {reviewTopicGroups.length} topic
                      {reviewTopicGroups.length === 1 ? "" : "s"} open
                    </span>
                  </div>
                ) : null}

                {reviewedThisVisitCount > 0 ? (
                  <div className="mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-800 dark:text-emerald-200">
                    You have cleared {reviewedThisVisitCount} mistake
                    {reviewedThisVisitCount === 1 ? "" : "s"} in this session.
                  </div>
                ) : null}
              </>
            ) : null}

            {reviewLoading ? (
              <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                Loading review sessions...
              </p>
            ) : reviewError ? (
              <p className="mt-6 text-sm text-rose-700 dark:text-rose-200">
                {reviewError}
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                {!hasVisibleReviewItems ? (
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-5 text-sm text-slate-600 dark:text-slate-300">
                    {reviewNextCursor
                      ? "You cleared the currently loaded mistakes. Load older sessions to continue reviewing."
                      : "You are all caught up. New misses from recent quizzes will show up here, while Progress trends shows whether those misses are turning into real improvement."}
                    {reviewedThisVisitCount > 0 ? (
                      <p className="mt-2 text-emerald-700 dark:text-emerald-200">
                        Nice work. You cleared {reviewedThisVisitCount} mistake
                        {reviewedThisVisitCount === 1 ? "" : "s"} this visit.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  reviewTopicGroups.map((group) => {
                    const isExpanded = expandedReviewTopics[group.topic] ?? false;
                    return (
                      <section
                        key={group.topic}
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
                      >
                        <button
                          type="button"
                          onClick={() => toggleReviewTopic(group.topic)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
                          aria-expanded={isExpanded}
                        >
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                              Topic review
                            </p>
                            <h3 className="mt-1 text-base font-medium text-slate-900 dark:text-slate-100">
                              {group.topic}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Latest mistake from {formatDateKey(group.items[0].dateKey)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
                              {group.items.length} mistake
                              {group.items.length === 1 ? "" : "s"}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {isExpanded ? "Hide" : "Show"}
                            </span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="space-y-4 border-t border-[color:var(--border)] px-4 py-4 sm:px-5">
                            {group.items.map((item) => {
                              const isMutating = Boolean(reviewMutatingIds[item.id]);
                              return (
                                <article
                                  key={item.id}
                                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                                        Missed on {formatDateKey(item.dateKey)}
                                      </p>
                                      <h4 className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">
                                        {item.prompt}
                                      </h4>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => markReviewItem(item.id)}
                                      disabled={isMutating}
                                      className="rounded-full border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                                    >
                                      {isMutating ? "Saving..." : "Clear from inbox"}
                                    </button>
                                  </div>

                                  {item.topics.length > 0 ? (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {item.topics.map((topic) => (
                                        <span
                                          key={`${item.id}-${topic}`}
                                          className={`rounded-full border px-3 py-1 text-xs ${
                                            topic === item.primaryTopic
                                              ? "border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-200"
                                              : "border-[color:var(--border)] bg-[color:var(--surface-muted)] text-slate-600 dark:text-slate-300"
                                          }`}
                                        >
                                          {topic}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-4">
                                      <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs text-slate-600 dark:text-slate-300">
                                        Uncategorized
                                      </span>
                                    </div>
                                  )}

                                  <div className="mt-4 grid gap-2 text-sm">
                                    {item.choices.map((choice, choiceIndex) => {
                                      const isCorrect =
                                        choiceIndex === item.correctAnswerIndex;
                                      const isSelected =
                                        choiceIndex === item.selectedAnswerIndex;
                                      const badge = isCorrect
                                        ? "Correct"
                                        : isSelected
                                        ? "Your answer"
                                        : null;

                                      return (
                                        <div
                                          key={`${item.id}-${choiceIndex}`}
                                          className={`rounded-xl border px-4 py-3 ${
                                            isCorrect
                                              ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                                              : isSelected
                                              ? "border-rose-400/60 bg-rose-400/10 text-rose-700 dark:text-rose-200"
                                              : "border-[color:var(--border)] bg-[color:var(--surface)] text-slate-700 dark:text-slate-200"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <span>{choice}</span>
                                            {badge ? (
                                              <span className="text-[11px] font-semibold uppercase tracking-wide">
                                                {badge}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                                    <p>
                                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                                        Your answer:
                                      </span>{" "}
                                      {item.selectedAnswer ?? "No recorded answer"}
                                    </p>
                                    <p>
                                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                                        Correct answer:
                                      </span>{" "}
                                      {item.correctAnswer}
                                    </p>
                                  </div>
                                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                    Explanation: {item.explanation}
                                  </p>
                                </article>
                              );
                            })}
                          </div>
                        ) : null}
                      </section>
                    );
                  })
                )}

                <div className="flex flex-col items-start gap-3">
                  {reviewNextCursor ? (
                    <button
                      type="button"
                      onClick={() => loadReviewSessions({ append: true })}
                      disabled={reviewLoadingMore}
                      className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                    >
                      {reviewLoadingMore ? "Loading older sessions..." : "Load older sessions"}
                    </button>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      You have reached the end of your review history.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
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
                        onClick={() => setApplyDays(value as 1 | 2 | 3 | 4 | 5)}
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
        ) : activeTab === "profile" ? (
          <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">My profile</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Performance summary based on your recent quiz history.
                </p>
              </div>
              <button
                type="button"
                onClick={loadStats}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Refresh
              </button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total questions answered
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {profileSummary.total}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-200">
                  Correct answers
                </p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-200">
                  {profileSummary.correct}
                </p>
                <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
                  {(correctRatio * 100).toFixed(0)}%
                </p>
              </div>
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
                <p className="text-xs text-rose-700 dark:text-rose-200">
                  Wrong answers
                </p>
                <p className="mt-2 text-2xl font-semibold text-rose-700 dark:text-rose-200">
                  {wrongAnswers}
                </p>
                <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/80">
                  {(wrongRatio * 100).toFixed(0)}%
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-200">
                  PvP won
                </p>
                <p className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-200">
                  {pvpSummary.won}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
                <p className="text-xs text-rose-700 dark:text-rose-200">
                  PvP lost
                </p>
                <p className="mt-2 text-2xl font-semibold text-rose-700 dark:text-rose-200">
                  {pvpSummary.lost}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Total friends
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {friendCount ?? "—"}
                </p>
              </div>
            </div>

            {statsLoading || backfillLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400/60 border-t-transparent dark:border-slate-500/70" />
                Updating statistics...
              </div>
            ) : topicStats.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                Complete more quizzes to unlock topic statistics.
              </p>
            ) : (
              <div className="mt-6 grid gap-6">
                <div className="flex items-center justify-center">
                  <svg
                    viewBox="0 0 280 280"
                    className="h-auto w-full max-w-[280px]"
                  >
                    <circle
                      cx="140"
                      cy="140"
                      r="110"
                      fill="none"
                      stroke="rgba(148,163,184,0.3)"
                      strokeWidth="1"
                    />
                    <circle
                      cx="140"
                      cy="140"
                      r="70"
                      fill="none"
                      stroke="rgba(148,163,184,0.3)"
                      strokeWidth="1"
                    />
                    {(() => {
                      const points = topicStats.map((stat, index) => {
                        const angle =
                          (Math.PI * 2 * index) / topicStats.length - Math.PI / 2;
                        const radius = 110 * Math.max(0.15, stat.accuracy);
                        const x = 140 + radius * Math.cos(angle);
                        const y = 140 + radius * Math.sin(angle);
                        return `${x},${y}`;
                      });
                      return (
                        <polygon
                          points={points.join(" ")}
                          fill="rgba(59,130,246,0.2)"
                          stroke="rgba(59,130,246,0.8)"
                          strokeWidth="2"
                        />
                      );
                    })()}
                    {topicStats.map((stat, index) => {
                      const angle =
                        (Math.PI * 2 * index) / topicStats.length - Math.PI / 2;
                      const x = 140 + 120 * Math.cos(angle);
                      const y = 140 + 120 * Math.sin(angle);
                      const label = truncateLabel(stat.topic);
                      return (
                        <text
                          key={stat.topic}
                          x={x}
                          y={y}
                          fill="currentColor"
                          fontSize="10"
                          textAnchor="middle"
                        >
                          <title>{stat.topic}</title>
                          {label}
                        </text>
                      );
                    })}
                  </svg>
                </div>
                <div className="space-y-3">
                  {topicStats.map((stat) => {
                    const strength =
                      stat.accuracy >= 0.7
                        ? "Strong"
                        : stat.accuracy < 0.4
                        ? "Needs work"
                        : "Developing";
                    return (
                      <div
                        key={stat.topic}
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {stat.topic}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {(stat.accuracy * 100).toFixed(0)}% · {strength}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {stat.correct.toFixed(1)} correct out of{" "}
                          {stat.total.toFixed(1)} questions (weighted).
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        ) : activeTab === "pvp" ? (
          user ? (
            <PvpPanel
              user={user}
              initialSessionId={pvpSessionId ?? undefined}
              initialAsyncMatchId={asyncMatchId ?? undefined}
            />
          ) : null
        ) : activeTab === "social" ? (
          user ? (
            <SocialPanel
              user={user}
              onOpenPvpSession={openPvpSession}
              onOpenAsyncMatch={openAsyncMatch}
            />
          ) : null
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
                    {(["global", "friends"] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setLeaderboardScope(scope)}
                        className={`rounded-full px-3 py-1 font-semibold ${
                          leaderboardScope === scope
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                        }`}
                        aria-pressed={leaderboardScope === scope}
                      >
                        {scope === "global" ? "Global" : "Friends"}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-1 py-1 text-xs">
                    {[10, 25, 50].map((value) => (
                      <button
                        key={value}
                        type="button"
                      onClick={() => setLeaderboardLimit(value as 10 | 25 | 50)}
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
                                  {(() => {
                                    const maskedEmail = maskEmail(entry.email);
                                    const displayLabel =
                                      entry.displayName ||
                                      maskedEmail ||
                                      "Anonymous";
                                    return (
                                  <div className="flex items-center gap-3">
                                    <span className="w-5 text-xs text-slate-400">
                                      {index + 1}
                                    </span>
                                    <span className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] text-xs font-semibold text-slate-600 dark:text-slate-200">
                                      {displayLabel
                                        .split(" ")
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((part) =>
                                          part[0]?.toUpperCase()
                                        )
                                        .join("")}
                                    </span>
                                    <span className="font-medium">
                                      {displayLabel}
                                    </span>
                                  </div>
                                    );
                                  })()}
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
      {user ? <ChatBubble user={user} /> : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent text-[color:var(--foreground)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Loading dashboard...
            </p>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
