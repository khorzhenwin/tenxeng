import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth/server";
import type { AsyncPvpMatch } from "@/lib/pvp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await context.params;
  const matchRef = adminDb.collection("asyncPvpMatches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const match = matchSnap.data() as AsyncPvpMatch;
  if (!match.participantIds.includes(user.uid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ match });
}
