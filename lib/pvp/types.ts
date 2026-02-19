import type { QuizQuestion } from "@/lib/quiz/types";

export type PvpSessionStatus =
  | "waiting"
  | "ready"
  | "in_progress"
  | "completed";

export type PvpPlayer = {
  uid: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
  submittedAt?: string;
  selectedAnswers?: Record<string, number>;
  score?: number;
  total?: number;
  timeTakenSeconds?: number;
};

export type PvpSession = {
  id: string;
  status: PvpSessionStatus;
  createdBy: string;
  createdAt: string;
  participantIds: string[];
  players: Record<string, PvpPlayer>;
  questions: QuizQuestion[];
  startedAt?: string;
  completedAt?: string;
  winnerUid?: string | null;
  winnerReason?: "score" | "time" | "tie";
};

export type PvpSessionHistoryEntry = {
  sessionId: string;
  opponentUid: string | null;
  opponentDisplayName: string | null;
  opponentEmail: string | null;
  myScore: number;
  myTotal: number;
  myTimeTakenSeconds: number;
  opponentScore: number;
  opponentTotal: number;
  opponentTimeTakenSeconds: number;
  winnerUid: string | null;
  winnerReason: "score" | "time" | "tie";
  outcome: "win" | "loss" | "draw";
  completedAt: string;
};
