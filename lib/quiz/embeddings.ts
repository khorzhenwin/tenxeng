import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_EMBEDDING_MODELS = ["gemini-embedding-001", "text-embedding-004"];

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function embedText(text: string) {
  const genAI = getClient();
  const configuredModel = process.env.GEMINI_EMBEDDING_MODEL?.trim();
  const candidates = configuredModel
    ? [configuredModel, ...DEFAULT_EMBEDDING_MODELS.filter((m) => m !== configuredModel)]
    : DEFAULT_EMBEDDING_MODELS;

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: candidate });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to embed content with models: ${candidates.join(", ")}.`,
    { cause: lastError }
  );
}

export function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
  }
  return dot;
}
