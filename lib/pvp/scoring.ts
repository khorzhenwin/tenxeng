import type { PvpPlayer, PvpSessionHistoryEntry } from "@/lib/pvp/types";

type PvpScorableSession = {
  id: string;
  questions: Array<{ id: string; answerIndex: number }>;
  players: Record<string, PvpPlayer>;
  winnerUid?: string | null;
  winnerReason?: "score" | "time" | "tie";
};

export function computeScore(
  questions: Array<{ id: string; answerIndex: number }>,
  selectedAnswers: Record<string, number>
): number {
  return questions.filter(
    (question) => selectedAnswers[question.id] === question.answerIndex
  ).length;
}

export function resolveWinner(
  firstUid: string,
  secondUid: string,
  session: PvpScorableSession
): { winnerUid: string | null; winnerReason: "score" | "time" | "tie" } {
  const first = session.players[firstUid];
  const second = session.players[secondUid];
  const firstScore = Number(first?.score ?? 0);
  const secondScore = Number(second?.score ?? 0);
  if (firstScore > secondScore) {
    return { winnerUid: firstUid, winnerReason: "score" };
  }
  if (secondScore > firstScore) {
    return { winnerUid: secondUid, winnerReason: "score" };
  }

  const firstTime = Number(first?.timeTakenSeconds ?? Number.POSITIVE_INFINITY);
  const secondTime = Number(second?.timeTakenSeconds ?? Number.POSITIVE_INFINITY);
  if (firstTime < secondTime) {
    return { winnerUid: firstUid, winnerReason: "time" };
  }
  if (secondTime < firstTime) {
    return { winnerUid: secondUid, winnerReason: "time" };
  }

  return { winnerUid: null, winnerReason: "tie" };
}

export function buildHistoryEntry(
  session: PvpScorableSession,
  myUid: string,
  opponentUid: string,
  completedAt: string,
  matchType: "sync" | "async" = "sync"
): PvpSessionHistoryEntry {
  const me = session.players[myUid];
  const opponent = session.players[opponentUid];
  const isDraw = !session.winnerUid;
  const outcome = isDraw
    ? "draw"
    : session.winnerUid === myUid
    ? "win"
    : "loss";

  return {
    sessionId: session.id,
    matchType,
    opponentUid,
    opponentDisplayName: opponent?.displayName ?? null,
    opponentEmail: opponent?.email ?? null,
    myScore: Number(me?.score ?? 0),
    myTotal: Number(me?.total ?? session.questions.length),
    myTimeTakenSeconds: Number(me?.timeTakenSeconds ?? 0),
    opponentScore: Number(opponent?.score ?? 0),
    opponentTotal: Number(opponent?.total ?? session.questions.length),
    opponentTimeTakenSeconds: Number(opponent?.timeTakenSeconds ?? 0),
    winnerUid: session.winnerUid ?? null,
    winnerReason: session.winnerReason ?? "tie",
    outcome,
    completedAt
  };
}
