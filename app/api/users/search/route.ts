import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:users_search_get`);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ users: [] as SearchUser[] });
  }

  const usersSnap = await adminDb.collection("users").limit(60).get();
  const users = usersSnap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        displayName: (data.displayName as string | undefined) ?? null,
        email: (data.email as string | undefined) ?? null
      } as SearchUser;
    })
    .filter((entry) => entry.uid !== user.uid)
    .filter((entry) => {
      const display = entry.displayName?.toLowerCase() ?? "";
      const email = entry.email?.toLowerCase() ?? "";
      return (
        display.includes(query) || email.includes(query) || entry.uid.includes(query)
      );
    })
    .slice(0, 10);

  return NextResponse.json({ users });
}
