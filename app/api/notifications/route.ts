import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:notifications_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const snap = await adminDb
    .collection("notifications")
    .where("uid", "==", user.uid)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const notifications = snap.docs.map((docSnap) => docSnap.data());
  return NextResponse.json({ notifications });
}
