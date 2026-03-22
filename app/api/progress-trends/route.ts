import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getProgressTrends } from "@/lib/quiz/progress-trends";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limiter = consumeRateLimit(`${user.uid}:progress_trends_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const data = await getProgressTrends(user.uid);
  return NextResponse.json(data);
}
