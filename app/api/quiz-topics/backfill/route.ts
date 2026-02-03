import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FieldValue } from "firebase-admin/firestore";
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
        questions?: {
          id: string;
          prompt: string;
          topics?: string[];
        }[];
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
      const historySnap = await userRef
        .collection("questionHistory")
        .where("dateKey", "==", dateKey)
        .get();
      const historyEntries = historySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        data: docSnap.data() as {
          questionId?: string;
          promptNormalized?: string;
          topics?: string[];
        },
      }));
      const historyByQuestionId = new Map(
        historyEntries
          .filter((entry) => entry.data.questionId)
          .map((entry) => [entry.data.questionId as string, entry])
      );
      const historyByPrompt = new Map(
        historyEntries
          .filter((entry) => entry.data.promptNormalized)
          .map((entry) => [entry.data.promptNormalized as string, entry])
      );

      const pendingQuestions = quiz.questions.filter((question) => {
        if (question.topics && question.topics.length > 0) return false;
        const historyEntry =
          historyByQuestionId.get(question.id) ??
          historyByPrompt.get(
            question.prompt.trim().toLowerCase().replace(/\s+/g, " ")
          );
        return !historyEntry?.data.topics?.length;
      });

      let topicMap = new Map<string, string[]>();
      if (pendingQuestions.length > 0) {
        const prompt = [
          "You are labeling system design questions with topics.",
          `Allowed topics: ${normalizedTopics.join(", ")}.`,
          'Return JSON: {"questions":[{"id":"...","topics":["Topic1","Topic2"]}]}',
          "Pick 1-2 allowed topics per question. Do not invent new topics.",
          "Questions:",
          ...pendingQuestions.map(
            (question) => `- (${question.id}) ${question.prompt}`
          ),
        ].join("\n");

        const result = await model.generateContent(prompt);
        const raw = result.response.text();
        const parsed = topicSchema.parse(JSON.parse(raw));
        topicMap = new Map(
          parsed.questions.map((entry) => [entry.id, entry.topics])
        );
      }

      const updatedQuestions = quiz.questions.map((question) => {
        if (question.topics && question.topics.length > 0) {
          return question;
        }
        const historyEntry =
          historyByQuestionId.get(question.id) ??
          historyByPrompt.get(
            question.prompt.trim().toLowerCase().replace(/\s+/g, " ")
          );
        const historyTopics = historyEntry?.data.topics;
        const topics = historyTopics?.length
          ? historyTopics
          : topicMap.get(question.id) ?? normalizedTopics.slice(0, 2);
        return {
          ...question,
          topics,
        };
      });

      const batch = adminDb.batch();
      batch.set(quizRef, { questions: updatedQuestions }, { merge: true });
      updatedQuestions.forEach((question) => {
        const historyEntry =
          historyByQuestionId.get(question.id) ??
          historyByPrompt.get(
            question.prompt.trim().toLowerCase().replace(/\s+/g, " ")
          );
        if (historyEntry && question.topics?.length) {
          const historyRef = userRef
            .collection("questionHistory")
            .doc(historyEntry.id);
          batch.set(
            historyRef,
            {
              topics: question.topics,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      });
      await batch.commit();
      return dateKey;
    })
  );

  return NextResponse.json({ updated: updates.filter(Boolean) });
}
