import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const markReadSchema = z.object({
  ids: z.array(z.string()).max(200).optional(),
  markAll: z.boolean().optional()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:notifications_read_post`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const payload = markReadSchema.parse(await request.json().catch(() => ({})));
  const now = new Date().toISOString();
  if (payload.markAll) {
    const snap = await adminDb
      .collection("notifications")
      .where("uid", "==", user.uid)
      .where("readAt", "==", null)
      .limit(200)
      .get();
    await Promise.all(
      snap.docs.map((docSnap) =>
        docSnap.ref.set(
          {
            readAt: now
          },
          { merge: true }
        )
      )
    );
    return NextResponse.json({ success: true });
  }

  const ids = payload.ids ?? [];
  await Promise.all(
    ids.map((id) =>
      adminDb
        .collection("notifications")
        .doc(id)
        .set(
          {
            readAt: now
          },
          { merge: true }
        )
    )
  );
  return NextResponse.json({ success: true });
}
