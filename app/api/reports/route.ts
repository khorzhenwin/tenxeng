import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportSchema = z.object({
  category: z.enum(["chat", "friend", "challenge", "abuse"]),
  targetUid: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  challengeId: z.string().min(1).optional(),
  reason: z.string().trim().min(3).max(1000)
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:reports_post`, { windowMs: 5000 });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many reports submitted in a short period." },
      { status: 429 }
    );
  }

  const payload = reportSchema.parse(await request.json());
  const ref = adminDb.collection("reports").doc();
  await ref.set({
    id: ref.id,
    reporterUid: user.uid,
    ...payload,
    status: "open",
    createdAt: new Date().toISOString()
  });
  return NextResponse.json({ success: true });
}
