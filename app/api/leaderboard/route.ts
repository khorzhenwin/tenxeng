import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import { getWeekEndDateKey } from "@/lib/quiz/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEZONE = "Asia/Singapore";
const querySchema = z.object({
  weekStart: z.string().regex(/^\d{8}$/),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const payload = querySchema.parse({
    weekStart: searchParams.get("weekStart") ?? "",
  });

  const weekStartKey = payload.weekStart;
  const weekEndKey = getWeekEndDateKey(TIMEZONE, weekStartKey);

  const resultsSnap = await adminDb
    .collectionGroup("quizResults")
    .where("dateKey", ">=", weekStartKey)
    .where("dateKey", "<=", weekEndKey)
    .orderBy("dateKey")
    .get();

  const totals = new Map<
    string,
    { correct: number; total: number }
  >();

  resultsSnap.forEach((docSnap) => {
    const data = docSnap.data() as { score?: number; total?: number };
    const path = docSnap.ref.path;
    const match = path.match(/users\/([^/]+)\/quizResults/);
    if (!match) return;
    const uid = match[1];
    const entry = totals.get(uid) ?? { correct: 0, total: 0 };
    entry.correct += Number(data.score ?? 0);
    entry.total += Number(data.total ?? 0);
    totals.set(uid, entry);
  });

  const sorted = Array.from(totals.entries())
    .map(([uid, entry]) => ({
      uid,
      correct: entry.correct,
      total: entry.total,
      accuracy: entry.total > 0 ? entry.correct / entry.total : 0,
    }))
    .sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return b.total - a.total;
    })
    .slice(0, 50);

  const userSnaps = await Promise.all(
    sorted.map((entry) => adminDb.collection("users").doc(entry.uid).get())
  );
  const topEntries = sorted.map((entry, index) => {
    const userSnap = userSnaps[index];
    const userData = userSnap.exists ? userSnap.data() : {};
    return {
      uid: entry.uid,
      displayName: (userData?.displayName as string | null) ?? null,
      email: (userData?.email as string | null) ?? null,
      correct: entry.correct,
      total: entry.total,
      accuracy: entry.accuracy,
    };
  });

  await adminDb
    .collection("leaderboards")
    .doc(weekStartKey)
    .set(
      {
        weekStartKey,
        weekEndKey,
        topEntries,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return NextResponse.json({ weekStartKey, weekEndKey, topEntries });
}
