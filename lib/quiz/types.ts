export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  topics?: string[];
};

export type DailyQuiz = {
  dateKey: string;
  questions: QuizQuestion[];
  generatedAt: string;
  timezone: string;
  model: string;
  topics?: string[];
};

export type QuizResult = {
  dateKey: string;
  score: number;
  total: number;
  selectedAnswers: Record<string, number>;
  completedAt: string;
};

export type PracticeSourceType =
  | "weak-topics"
  | "recent-mistakes";

export type PracticeSessionStatus = "ready" | "completed";

export type PracticeSession = {
  id: string;
  sourceType: PracticeSourceType;
  topics: string[];
  questions: QuizQuestion[];
  createdAt: string;
  status: PracticeSessionStatus;
  total: number;
  selectedAnswers: Record<string, number>;
  score: number | null;
  completedAt: string | null;
};

export type QuizReviewItem = {
  id: string;
  dateKey: string;
  completedAt: string;
  questionId: string;
  primaryTopic: string;
  prompt: string;
  choices: string[];
  selectedAnswerIndex: number | null;
  selectedAnswer: string | null;
  correctAnswerIndex: number;
  correctAnswer: string;
  explanation: string;
  topics: string[];
};

export type QuizReviewSession = {
  id: string;
  dateKey: string;
  completedAt: string;
  score: number;
  total: number;
  mistakeCount: number;
  items: QuizReviewItem[];
};

export type ReviewedMistake = {
  itemId: string;
  reviewedAt: string | null;
};

export type WeakTopicSignal = {
  topic: string;
  accuracy: number;
  total: number;
  wrong: number;
  latestCompletedAt: string;
};

export type QuizTrendPoint = {
  dateKey: string;
  score: number;
  total: number;
  accuracy: number;
  completedAt: string;
};

export type PracticeTrendPoint = {
  dateKey: string;
  completedCount: number;
  averageAccuracy: number;
  totalQuestions: number;
};

export type ProgressTrendsSummary = {
  completedQuizzes: number;
  completedPracticeSessions: number;
  averageQuizAccuracy: number | null;
  averagePracticeAccuracy: number | null;
};

export type ProgressTrendsPayload = {
  summary: ProgressTrendsSummary;
  quizSeries: QuizTrendPoint[];
  practiceSeries: PracticeTrendPoint[];
  weakTopics: WeakTopicSignal[];
};

export type TopicSchedule = {
  dateKey: string;
  topics: string[];
  createdAt: string;
};
