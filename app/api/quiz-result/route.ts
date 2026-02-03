import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import {
  getWeekEndDateKey,
  getWeekStartDateKey,
  parseDateKeyToDate,
} from "@/lib/quiz/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEZONE = "Asia/Singapore";

const resultSchema = z.object({
  dateKey: z.string().regex(/^\d{8}$/),
  selectedAnswers: z.record(z.string(), z.number().int().min(0)),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = resultSchema.parse(await request.json());
  const userRef = adminDb.collection("users").doc(user.uid);
  const quizRef = userRef.collection("dailyQuizzes").doc(payload.dateKey);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) {
    return NextResponse.json(
      { error: "Quiz not found for date." },
      { status: 404 }
    );
  }

  const quiz = quizSnap.data() as {
    questions: { id: string; answerIndex: number }[];
  };
  const total = quiz.questions.length;
  const score = quiz.questions.filter(
    (question) =>
      payload.selectedAnswers[question.id] === question.answerIndex
  ).length;

  const result = {
    dateKey: payload.dateKey,
    score,
    total,
    selectedAnswers: payload.selectedAnswers,
    completedAt: new Date().toISOString(),
  };

  await userRef
    .collection("quizResults")
    .doc(payload.dateKey)
    .set(result, { merge: true });

  const weekStartKey = getWeekStartDateKey(
    TIMEZONE,
    parseDateKeyToDate(payload.dateKey)
  );
  const weekEndKey = getWeekEndDateKey(TIMEZONE, weekStartKey);
  const weekResultsSnap = await userRef
    .collection("quizResults")
    .where("dateKey", ">=", weekStartKey)
    .where("dateKey", "<=", weekEndKey)
    .get();

  let correct = 0;
  let answered = 0;
  weekResultsSnap.forEach((docSnap) => {
    const data = docSnap.data() as { score?: number; total?: number };
    correct += Number(data.score ?? 0);
    answered += Number(data.total ?? 0);
  });
  const accuracy = answered > 0 ? correct / answered : 0;

  const leaderboardRef = adminDb.collection("leaderboards").doc(weekStartKey);
  await leaderboardRef.set(
    {
      weekStartKey,
      weekEndKey,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await leaderboardRef.collection("entries").doc(user.uid).set(
    {
      uid: user.uid,
      displayName: user.name ?? null,
      email: user.email ?? null,
      correct,
      total: answered,
      accuracy,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const topEntriesSnap = await leaderboardRef
    .collection("entries")
    .orderBy("correct", "desc")
    .orderBy("accuracy", "desc")
    .orderBy("total", "desc")
    .limit(50)
    .get();
  const topEntries = topEntriesSnap.docs.map((docSnap) => docSnap.data());
  await leaderboardRef.set(
    {
      topEntries,
    },
    { merge: true }
  );

  return NextResponse.json({ score, total });
}
