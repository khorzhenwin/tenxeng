export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
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

export type TopicSchedule = {
  dateKey: string;
  topics: string[];
  createdAt: string;
};
