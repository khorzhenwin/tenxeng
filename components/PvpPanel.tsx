"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { PvpSession, PvpSessionHistoryEntry } from "@/lib/pvp/types";

type PvpPanelProps = {
  user: User;
  initialSessionId?: string;
};

const HISTORY_PAGE_SIZE = 20;

export default function PvpPanel({ user, initialSessionId }: PvpPanelProps) {
  const [sessionIdInput, setSessionIdInput] = useState(initialSessionId ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<PvpSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<PvpSessionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [challengeingUid, setChallengeingUid] = useState<string | null>(null);
  const [challengeNotice, setChallengeNotice] = useState<string | null>(null);
  const timerStartedAt = useRef<number | null>(null);
  const startedRequestedRef = useRef(false);
  const joinedByParamRef = useRef(false);

  const myPlayer = session?.players[user.uid] ?? null;
  const opponentUid =
    session?.participantIds.find(
      (participantId) => participantId !== user.uid,
    ) ?? null;
  const opponent = opponentUid ? session?.players[opponentUid] : null;
  const hasSubmitted = Boolean(myPlayer?.submittedAt);
  const showModal = hasSubmitted;

  const totalQuestions = session?.questions.length ?? 0;
  const hasAnsweredAll = useMemo(() => {
    if (!session || session.questions.length === 0) return false;
    return session.questions.every((question) =>
      Object.prototype.hasOwnProperty.call(answers, question.id),
    );
  }, [answers, session]);

  const fetchSession = useCallback(async (targetSessionId: string) => {
    const response = await fetch(`/api/pvp/session/${targetSessionId}`);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Unable to fetch session.");
    }
    const data = (await response.json()) as { session: PvpSession };
    setSession(data.session);
    return data.session;
  }, []);

  const fetchHistory = useCallback(
    async ({
      reset = false,
      cursor,
    }: { reset?: boolean; cursor?: string | null } = {}) => {
      const targetCursor = reset ? null : (cursor ?? null);
      if (reset) {
        setHistoryLoading(true);
        setHistoryError(null);
      } else {
        setHistoryLoadingMore(true);
      }
      try {
        const query = new URLSearchParams({
          pageSize: String(HISTORY_PAGE_SIZE),
        });
        if (targetCursor) {
          query.set("cursor", targetCursor);
        }
        const response = await fetch(`/api/pvp/history?${query.toString()}`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            code?: string;
          } | null;
          if (payload?.code === "INDEX_NOT_READY") {
            throw new Error(
              payload.error ??
                "PvP history index is still building. Please try again shortly.",
            );
          }
          throw new Error(payload?.error ?? "Unable to load PvP history.");
        }
        const data = (await response.json()) as {
          history: PvpSessionHistoryEntry[];
          nextCursor: string | null;
          hasMore: boolean;
        };
        setHistory((prev) => {
          if (reset) {
            return data.history ?? [];
          }
          const merged = [...prev, ...(data.history ?? [])];
          const deduped = new Map<string, PvpSessionHistoryEntry>();
          merged.forEach((item) => deduped.set(item.sessionId, item));
          return Array.from(deduped.values());
        });
        setHistoryCursor(data.nextCursor ?? null);
        setHistoryHasMore(Boolean(data.hasMore));
      } catch (historyLoadError) {
        const message =
          historyLoadError instanceof Error
            ? historyLoadError.message
            : "Unable to load PvP history.";
        setHistoryError(message);
      } finally {
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
      }
    },
    [],
  );

  const joinSession = useCallback(
    async (targetSessionId: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/pvp/session/${targetSessionId}/join`,
          {
            method: "POST",
          },
        );
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to join session.");
        }
        const data = (await response.json()) as { session: PvpSession };
        setSession(data.session);
        setSessionId(targetSessionId);
        setAnswers(data.session.players[user.uid]?.selectedAnswers ?? {});
        setTimerSeconds(0);
        timerStartedAt.current = null;
        startedRequestedRef.current = false;
      } catch (joinError) {
        const message =
          joinError instanceof Error
            ? joinError.message
            : "Unable to join session.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [user.uid],
  );

  const createSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pvp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to create session.");
      }
      const data = (await response.json()) as {
        sessionId: string;
        session: PvpSession;
      };
      setSessionId(data.sessionId);
      setSession(data.session);
      setSessionIdInput(data.sessionId);
      setAnswers({});
      setTimerSeconds(0);
      timerStartedAt.current = null;
      startedRequestedRef.current = false;
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : "Unable to create session.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = useCallback(async () => {
    if (!sessionId) return;
    setStarting(true);
    try {
      const response = await fetch(`/api/pvp/session/${sessionId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to start session.");
      }
      const data = (await response.json()) as { session: PvpSession };
      setSession(data.session);
    } catch (startError) {
      const message =
        startError instanceof Error
          ? startError.message
          : "Unable to start session.";
      setError(message);
      startedRequestedRef.current = false;
    } finally {
      setStarting(false);
    }
  }, [sessionId]);

  const handleSubmit = async () => {
    if (!sessionId || !session || !hasAnsweredAll) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/pvp/session/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedAnswers: answers,
          timeTakenSeconds: timerSeconds,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to submit answers.");
      }
      const data = (await response.json()) as { session: PvpSession };
      setSession(data.session);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit answers.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!initialSessionId || joinedByParamRef.current) return;
    joinedByParamRef.current = true;
    setSessionIdInput(initialSessionId);
    joinSession(initialSessionId);
  }, [initialSessionId, joinSession]);

  useEffect(() => {
    fetchHistory({ reset: true });
  }, [fetchHistory]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const nextSession = await fetchSession(sessionId);
        if (cancelled) return;
        const persistedAnswers = nextSession.players[user.uid]?.selectedAnswers;
        if (persistedAnswers) {
          setAnswers(persistedAnswers);
        }
      } catch {
        // Ignore transient polling failures and keep retrying.
      }
    };

    poll();
    const poller = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(poller);
    };
  }, [fetchSession, sessionId, user.uid]);

  useEffect(() => {
    if (!session) return;
    if (
      session.status === "ready" &&
      session.participantIds.length === 2 &&
      !startedRequestedRef.current
    ) {
      startedRequestedRef.current = true;
      handleStartSession();
    }
  }, [handleStartSession, session]);

  useEffect(() => {
    if (!session || session.status !== "in_progress" || hasSubmitted) {
      return;
    }
    if (!timerStartedAt.current) {
      timerStartedAt.current = Date.now() - timerSeconds * 1000;
    }
    const interval = setInterval(() => {
      if (!timerStartedAt.current) return;
      const elapsed = Math.floor((Date.now() - timerStartedAt.current) / 1000);
      setTimerSeconds(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasSubmitted, session, timerSeconds]);

  useEffect(() => {
    if (session?.status === "completed") {
      fetchHistory({ reset: true });
    }
  }, [fetchHistory, session?.status]);

  const sessionLink = useMemo(() => {
    if (!sessionId) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/dashboard?pvpSession=${sessionId}`;
  }, [sessionId]);

  const winnerLabel = useMemo(() => {
    if (!session || session.status !== "completed") return "";
    if (!session.winnerUid) return "Draw";
    return session.winnerUid === user.uid ? "You win!" : "You lose";
  }, [session, user.uid]);

  const handleCopySessionLink = async () => {
    if (!sessionLink) return;
    try {
      await navigator.clipboard.writeText(sessionLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Unable to copy link.");
    }
  };

  const challengeOpponent = async (targetUid: string | null) => {
    if (!targetUid) return;
    setChallengeingUid(targetUid);
    setChallengeNotice(null);
    try {
      const response = await fetch("/api/pvp/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengedUid: targetUid }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to send challenge.");
      }
      setChallengeNotice("Challenge sent.");
    } catch (challengeError) {
      setChallengeNotice(
        challengeError instanceof Error
          ? challengeError.message
          : "Unable to send challenge.",
      );
    } finally {
      setChallengeingUid(null);
    }
  };

  return (
    <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">PvP mode</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create a room, share link, and race through 5 shared questions.
          </p>
        </div>
        <button
          type="button"
          onClick={createSession}
          disabled={loading}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Create session
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none dark:text-slate-200"
          placeholder="Enter session id to join"
          value={sessionIdInput}
          onChange={(event) => setSessionIdInput(event.target.value)}
        />
        <button
          type="button"
          disabled={loading || sessionIdInput.trim().length === 0}
          onClick={() => joinSession(sessionIdInput.trim())}
          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
        >
          Join session
        </button>
      </div>

      {sessionLink ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Share link
            </p>
            <button
              type="button"
              onClick={handleCopySessionLink}
              className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:text-slate-300"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-1 break-all text-slate-700 dark:text-slate-200">
            {sessionLink}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-rose-700 dark:text-rose-200">{error}</p>
      ) : null}

      {session ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Session ID: {session.id}
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              Players: {session.participantIds.length}/2
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              Status: {session.status.replace("_", " ")}
            </p>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              Opponent:{" "}
              {opponent?.displayName ?? opponent?.email ?? "Waiting..."}
            </p>
          </div>

          {session.status === "waiting" ? (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-slate-600 dark:text-slate-300">
              Waiting for second player to join...
            </div>
          ) : null}

          {session.status === "ready" || starting ? (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400/60 border-t-transparent dark:border-slate-500/70" />
                Generating shared questions...
              </div>
            </div>
          ) : null}

          {session.status === "in_progress" ||
          session.status === "completed" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                Timer: {timerSeconds}s
              </div>
              {session.questions.map((question, index) => {
                const selectedAnswer =
                  answers[question.id] ??
                  myPlayer?.selectedAnswers?.[question.id];
                const showResults = session.status === "completed";
                return (
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
                        const isSelected = selectedAnswer === choiceIndex;
                        const isCorrect =
                          showResults && choiceIndex === question.answerIndex;
                        const isWrong =
                          showResults &&
                          isSelected &&
                          choiceIndex !== question.answerIndex;
                        return (
                          <button
                            key={`${question.id}-${choiceIndex}`}
                            className={`rounded-xl border px-4 py-2 text-left text-sm ${
                              isCorrect
                                ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200"
                                : isWrong
                                  ? "border-rose-400/60 bg-rose-400/10 text-rose-700 dark:text-rose-200"
                                  : isSelected
                                    ? "border-slate-400 bg-[color:var(--surface)] text-slate-900 dark:text-slate-100"
                                    : "border-[color:var(--border)] bg-[color:var(--surface)] text-slate-700 hover:border-slate-400 dark:text-slate-200"
                            }`}
                            type="button"
                            disabled={
                              hasSubmitted || session.status === "completed"
                            }
                            onClick={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [question.id]: choiceIndex,
                              }))
                            }
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasAnsweredAll || hasSubmitted || submitting}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {hasSubmitted ? "Submitted" : "Submit answers"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showModal && session ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-xl">
            {session.status !== "completed" ? (
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Submission received
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400/60 border-t-transparent dark:border-slate-500/70" />
                  Waiting for other player
                </div>
              </div>
            ) : (
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Session complete
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {winnerLabel}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  You: {myPlayer?.score ?? 0}/
                  {myPlayer?.total ?? totalQuestions} in{" "}
                  {myPlayer?.timeTakenSeconds ?? 0}s
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Opponent: {opponent?.score ?? 0}/
                  {opponent?.total ?? totalQuestions} in{" "}
                  {opponent?.timeTakenSeconds ?? 0}s
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSession(null);
                    setSessionId(null);
                    setTimerSeconds(0);
                    timerStartedAt.current = null;
                    startedRequestedRef.current = false;
                  }}
                  className="mt-4 rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            PvP history
          </h3>
          <button
            type="button"
            onClick={() => fetchHistory({ reset: true })}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Refresh
          </button>
        </div>
        {historyLoading ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Loading history...
          </p>
        ) : historyError ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            {historyError}
          </p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No PvP matches yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {challengeNotice ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {challengeNotice}
              </p>
            ) : null}
            {history.map((entry) => (
              <div
                key={entry.sessionId}
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3 text-sm"
              >
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      Vs{" "}
                      {entry.opponentDisplayName ??
                        entry.opponentEmail ??
                        "Unknown"}
                    </p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      You {entry.myScore}/{entry.myTotal} (
                      {entry.myTimeTakenSeconds}s)
                      {" · "}
                      Opponent {entry.opponentScore}/{entry.opponentTotal} (
                      {entry.opponentTimeTakenSeconds}s)
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Outcome:{" "}
                      <span
                        className={
                          entry.outcome === "win"
                            ? "font-semibold text-emerald-600 dark:text-emerald-400"
                            : entry.outcome === "loss"
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : "font-semibold text-slate-400 dark:text-slate-200"
                        }
                      >
                        {entry.outcome === "win"
                          ? "won"
                          : entry.outcome === "loss"
                            ? "loss"
                            : "draw"}
                      </span>{" "}
                      ({entry.winnerReason})
                    </p>
                  </div>
                  <p className="text-right text-xs text-slate-500 dark:text-slate-400">
                    {new Date(entry.completedAt).toLocaleString()}
                  </p>
                </div>
                {entry.opponentUid ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={challengeingUid === entry.opponentUid}
                      onClick={() => challengeOpponent(entry.opponentUid)}
                      className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300"
                    >
                      {challengeingUid === entry.opponentUid
                        ? "Sending..."
                        : "Challenge again"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {historyHasMore ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => fetchHistory({ cursor: historyCursor })}
                  disabled={historyLoadingMore}
                  className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300"
                >
                  {historyLoadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
