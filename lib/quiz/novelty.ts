import type { QuizQuestion } from "@/lib/quiz/types";
import { cosineSimilarity, embedText, normalizeVector } from "@/lib/quiz/embeddings";
import { generateSystemDesignQuiz } from "@/lib/quiz/generate";

const BASE_SIMILARITY_THRESHOLD = 0.82;
const TOPIC_OVERLAP_THRESHOLD = 0.77;
const RECENT_TOPIC_OVERLAP_THRESHOLD = 0.74;
const RECENT_HISTORY_WINDOW = 50;

export type QuestionHistoryEntry = {
  promptNormalized?: string;
  topics?: string[];
  embedding?: number[];
};

export function normalizeQuestionPrompt(prompt: string) {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasTopicOverlap(
  candidateTopics: string[] | undefined,
  historyTopics: string[] | undefined
) {
  if (!candidateTopics?.length || !historyTopics?.length) {
    return false;
  }

  const historySet = new Set(historyTopics.map((topic) => topic.trim().toLowerCase()));
  return candidateTopics.some((topic) =>
    historySet.has(topic.trim().toLowerCase())
  );
}

function getSimilarityThreshold(
  candidateTopics: string[] | undefined,
  historyTopics: string[] | undefined,
  historyIndex: number
) {
  if (!hasTopicOverlap(candidateTopics, historyTopics)) {
    return BASE_SIMILARITY_THRESHOLD;
  }

  return historyIndex < RECENT_HISTORY_WINDOW
    ? RECENT_TOPIC_OVERLAP_THRESHOLD
    : TOPIC_OVERLAP_THRESHOLD;
}

function hasExactPromptMatch(
  questions: QuizQuestion[],
  historyPromptSet: Set<string>
) {
  const promptSet = new Set<string>();
  for (const question of questions) {
    const normalized = normalizeQuestionPrompt(question.prompt);
    if (promptSet.has(normalized) || historyPromptSet.has(normalized)) {
      return true;
    }
    promptSet.add(normalized);
  }
  return false;
}

export async function generateNovelQuizQuestions(options: {
  modelName: string;
  topics: string[];
  historyEntries: QuestionHistoryEntry[];
  maxRetries: number;
}) {
  const historyEmbeddings = options.historyEntries.map((entry) => ({
    embedding: Array.isArray(entry.embedding) ? entry.embedding : null,
    topics: entry.topics ?? [],
  }));
  const historyPromptSet = new Set(
    options.historyEntries.map((entry) => String(entry.promptNormalized ?? ""))
  );

  let questions = await generateSystemDesignQuiz(options.modelName, options.topics);
  let normalizedEmbeddings: number[][] = [];
  let attempt = 0;

  while (attempt < options.maxRetries) {
    attempt += 1;

    if (hasExactPromptMatch(questions, historyPromptSet)) {
      questions = await generateSystemDesignQuiz(options.modelName, options.topics);
      continue;
    }

    const embeddings = await Promise.all(
      questions.map((question) => embedText(question.prompt))
    );
    normalizedEmbeddings = embeddings.map((embedding) => normalizeVector(embedding));

    const isTooSimilar = normalizedEmbeddings.some((embedding, questionIndex) =>
      historyEmbeddings.some((historyEntry, historyIndex) => {
        if (!historyEntry.embedding) {
          return false;
        }

        const threshold = getSimilarityThreshold(
          questions[questionIndex]?.topics,
          historyEntry.topics,
          historyIndex
        );

        return cosineSimilarity(embedding, historyEntry.embedding) >= threshold;
      })
    );

    if (!isTooSimilar) {
      break;
    }

    questions = await generateSystemDesignQuiz(options.modelName, options.topics);
  }

  return { questions, normalizedEmbeddings };
}
