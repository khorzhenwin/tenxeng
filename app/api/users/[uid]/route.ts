import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ uid: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:users_uid_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const { uid } = await context.params;
  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const data = userSnap.data();
  return NextResponse.json({
    profile: {
      uid,
      displayName: (data?.displayName as string | undefined) ?? null,
      timezone: (data?.timezone as string | undefined) ?? null,
      lastActiveAt: (data?.lastActiveAt as string | undefined) ?? null
    }
  });
}
