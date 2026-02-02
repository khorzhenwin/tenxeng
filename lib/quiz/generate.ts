import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { QuizQuestion } from "@/lib/quiz/types";

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().min(10),
        choices: z.array(z.string().min(1)).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanation: z.string().min(10),
      })
    )
    .length(5),
});

const SYSTEM_PROMPT = [
  "You are a senior backend engineer and system design interviewer.",
  "Generate 5 multiple-choice questions focused on system design for backend engineers.",
  "Each question must have 4 choices, 1 correct answer index, and a short explanation.",
  "Keep questions concise and practical (scalability, reliability, data modeling, caching, queues, consistency).",
  'Return ONLY valid JSON in the shape: {"questions":[{"prompt":"","choices":["","","",""],"answerIndex":0,"explanation":""}]}',
].join(" ");

export async function generateSystemDesignQuiz(
  modelName: string,
  topics?: string[]
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  });

  const topicPrompt =
    topics && topics.length > 0
      ? `${SYSTEM_PROMPT} Prioritize these topics: ${topics.join(", ")}.`
      : SYSTEM_PROMPT;
  const result = await model.generateContent(topicPrompt);
  const raw = result.response.text();
  const parsed = quizSchema.parse(JSON.parse(raw));

  return parsed.questions.map(
    (question): QuizQuestion => ({
      id: randomUUID(),
      prompt: question.prompt.trim(),
      choices: question.choices.map((choice) => choice.trim()),
      answerIndex: question.answerIndex,
      explanation: question.explanation.trim(),
    })
  );
}
