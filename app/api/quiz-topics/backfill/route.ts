import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";

const MODEL_NAME = "gemini-3-flash-preview";
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

const topicSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      topics: z.array(z.string().min(1)).min(1).max(2),
    })
  ),
});

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  return new GoogleGenerativeAI(apiKey);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  dateKeys: z.array(z.string().regex(/^\d{8}$/)).min(1).max(200),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = payloadSchema.parse(await request.json());
  const userRef = adminDb.collection("users").doc(user.uid);
  const genAI = getClient();
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const updates = await Promise.all(
    payload.dateKeys.map(async (dateKey) => {
      const quizRef = userRef.collection("dailyQuizzes").doc(dateKey);
      const quizSnap = await quizRef.get();
      if (!quizSnap.exists) return null;
      const quiz = quizSnap.data() as {
        topics?: string[];
        questions?: { id: string; prompt: string; topics?: string[] }[];
      };
      const fallbackTopics = quiz.topics ?? DEFAULT_TOPICS;
      if (!quiz.questions || quiz.questions.length === 0) return null;
      const needsBackfill = quiz.questions.some(
        (question) => !question.topics || question.topics.length === 0
      );
      if (!needsBackfill) return null;

      const normalizedTopics = Array.from(
        new Set(fallbackTopics.map((topic) => topic.trim()).filter(Boolean))
      );
      const prompt = [
        "You are labeling system design questions with topics.",
        `Allowed topics: ${normalizedTopics.join(", ")}.`,
        'Return JSON: {"questions":[{"id":"...","topics":["Topic1","Topic2"]}]}',
        "Pick 1-2 allowed topics per question. Do not invent new topics.",
        "Questions:",
        ...quiz.questions.map(
          (question) => `- (${question.id}) ${question.prompt}`
        ),
      ].join("\n");

      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      const parsed = topicSchema.parse(JSON.parse(raw));
      const topicMap = new Map(
        parsed.questions.map((entry) => [entry.id, entry.topics])
      );

      const updatedQuestions = quiz.questions.map((question) => {
        if (question.topics && question.topics.length > 0) {
          return question;
        }
        const topics = topicMap.get(question.id);
        return {
          ...question,
          topics: topics?.length ? topics : normalizedTopics.slice(0, 2),
        };
      });

      await quizRef.set({ questions: updatedQuestions }, { merge: true });
      return dateKey;
    })
  );

  return NextResponse.json({ updated: updates.filter(Boolean) });
}
