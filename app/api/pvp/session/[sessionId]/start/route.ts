import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import { generateSystemDesignQuiz } from "@/lib/quiz/generate";
import type { PvpSession } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_NAME = "gemini-3-flash-preview";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const sessionRef = adminDb.collection("pvpSessions").doc(sessionId);
  const snap = await sessionRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const session = snap.data() as PvpSession;
  if (!session.participantIds.includes(user.uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.participantIds.length < 2) {
    return NextResponse.json(
      { error: "Waiting for second player." },
      { status: 409 }
    );
  }
  if (session.questions.length > 0 && session.status !== "ready") {
    return NextResponse.json({ session });
  }

  const questions =
    session.questions.length > 0
      ? session.questions
      : await generateSystemDesignQuiz(MODEL_NAME);
  const startedAt = new Date().toISOString();

  const nextSession = await adminDb.runTransaction(async (tx) => {
    const currentSnap = await tx.get(sessionRef);
    if (!currentSnap.exists) {
      throw new Error("NOT_FOUND");
    }
    const current = currentSnap.data() as PvpSession;
    if (current.questions.length > 0 && current.status !== "ready") {
      return current;
    }

    const update: Partial<PvpSession> = {
      questions:
        current.questions.length > 0 ? current.questions : questions,
      status: "in_progress",
      startedAt: current.startedAt ?? startedAt,
    };
    tx.set(sessionRef, update, { merge: true });

    return {
      ...current,
      ...update,
    };
  });

  return NextResponse.json({ session: nextSession });
}
