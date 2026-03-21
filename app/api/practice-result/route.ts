import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import type { PracticeSession } from "@/lib/quiz/types";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resultSchema = z.object({
  sessionId: z.string().min(1),
  selectedAnswers: z.record(z.string(), z.number().int().min(0)),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:practice_result_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const parsed = resultSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sessionRef = adminDb
    .collection("users")
    .doc(user.uid)
    .collection("practiceSessions")
    .doc(parsed.data.sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return NextResponse.json(
      { error: "Practice session not found." },
      { status: 404 }
    );
  }

  const session = sessionSnap.data() as PracticeSession;
  if (session.status === "completed") {
    return NextResponse.json(
      { error: "Practice session already completed." },
      { status: 409 }
    );
  }

  const total = session.questions.length;
  const score = session.questions.filter(
    (question) => parsed.data.selectedAnswers[question.id] === question.answerIndex
  ).length;

  const updatedSession: PracticeSession = {
    ...session,
    selectedAnswers: parsed.data.selectedAnswers,
    score,
    total,
    status: "completed",
    completedAt: new Date().toISOString(),
  };

  await sessionRef.set(updatedSession, { merge: true });

  return NextResponse.json({
    session: updatedSession,
    score,
    total,
  });
}
