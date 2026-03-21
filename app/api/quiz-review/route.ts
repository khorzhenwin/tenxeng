import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { getQuizReviewSessions } from "@/lib/quiz/review";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
  cursor: z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || !Number.isNaN(Date.parse(value)),
      "Invalid cursor."
    ),
});

const markReviewedSchema = z.object({
  itemId: z.string().regex(/^\d{8}:.+/),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:quiz_review_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters." },
      { status: 400 }
    );
  }

  const { sessions, nextCursor } = await getQuizReviewSessions(user.uid, {
    limit: parsed.data.limit,
    cursor: parsed.data.cursor ?? null,
  });

  return NextResponse.json({ sessions, nextCursor });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:quiz_review_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const parsed = markReviewedSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  await adminDb
    .collection("users")
    .doc(user.uid)
    .collection("reviewedMistakes")
    .doc(parsed.data.itemId)
    .set(
      {
        itemId: parsed.data.itemId,
        reviewedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true, itemId: parsed.data.itemId });
}
