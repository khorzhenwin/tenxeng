import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import { getDateKeyForTimezone } from "@/lib/quiz/date";
import { generateSystemDesignQuiz } from "@/lib/quiz/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_NAME = "gemini-3-flash-preview";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRef = adminDb.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  const timezone =
    (userSnap.data()?.timezone as string | undefined) ?? "UTC";
  const dateKey = getDateKeyForTimezone(timezone);

  const quizRef = userRef.collection("dailyQuizzes").doc(dateKey);
  const quizSnap = await quizRef.get();

  if (quizSnap.exists) {
    await userRef.set(
      { lastActiveAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return NextResponse.json(quizSnap.data());
  }

  const questions = await generateSystemDesignQuiz(MODEL_NAME);
  const quiz = {
    dateKey,
    timezone,
    model: MODEL_NAME,
    questions,
    generatedAt: new Date().toISOString(),
  };

  await quizRef.set(quiz);
  await userRef.set(
    {
      timezone,
      lastActiveAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json(quiz);
}
