import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

function normalizeLoose(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCompact(input: string): string {
  return normalizeLoose(input).replace(/[^a-z0-9]/g, "");
}

function scoreMatch(query: string, candidate: SearchUser): number {
  const display = candidate.displayName ?? "";
  const email = candidate.email ?? "";
  const uid = candidate.uid ?? "";

  const queryLoose = normalizeLoose(query);
  const queryCompact = normalizeCompact(query);
  const displayLoose = normalizeLoose(display);
  const emailLoose = normalizeLoose(email);
  const uidLoose = normalizeLoose(uid);
  const displayCompact = normalizeCompact(display);
  const emailCompact = normalizeCompact(email);
  const uidCompact = normalizeCompact(uid);

  let score = 0;

  // Strong match priority for email exact/prefix since many users search by email.
  if (emailLoose === queryLoose) score = Math.max(score, 140);
  if (emailLoose.startsWith(queryLoose)) score = Math.max(score, 130);
  if (emailLoose.includes(queryLoose)) score = Math.max(score, 120);

  // Display name and uid partial/prefix matches.
  if (displayLoose === queryLoose) score = Math.max(score, 115);
  if (displayLoose.startsWith(queryLoose)) score = Math.max(score, 110);
  if (displayLoose.includes(queryLoose)) score = Math.max(score, 100);
  if (uidLoose === queryLoose) score = Math.max(score, 105);
  if (uidLoose.startsWith(queryLoose)) score = Math.max(score, 95);
  if (uidLoose.includes(queryLoose)) score = Math.max(score, 90);

  // Whitespace/punctuation-insensitive matching: "khorzhenwin" matches "Khor Zhen Win".
  if (queryCompact.length > 0) {
    if (displayCompact.includes(queryCompact)) score = Math.max(score, 88);
    if (emailCompact.includes(queryCompact)) score = Math.max(score, 86);
    if (uidCompact.includes(queryCompact)) score = Math.max(score, 84);
  }

  // Token-based fuzzy matching helps mixed-order or spaced queries.
  const tokens = queryLoose.split(" ").filter(Boolean);
  if (
    tokens.length > 1 &&
    tokens.every(
      (token) =>
        displayLoose.includes(token) ||
        emailLoose.includes(token) ||
        uidLoose.includes(token)
    )
  ) {
    score = Math.max(score, 80);
  }

  return score;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limiter = consumeRateLimit(`${user.uid}:users_search_get`, {
    windowMs: 300
  });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ users: [] as SearchUser[] });
  }

  // Scan users in pages so search does not miss matches
  // when target users are beyond first N docs.
  const usersCollection = adminDb.collection("users");
  const dbUsers: SearchUser[] = [];
  const MAX_DB_SCAN = 5000;
  const PAGE_SIZE = 500;
  let scanned = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (scanned < MAX_DB_SCAN) {
    let pageQuery: FirebaseFirestore.Query = usersCollection
      .orderBy("__name__")
      .limit(PAGE_SIZE);
    if (cursor) {
      pageQuery = pageQuery.startAfter(cursor);
    }
    const pageSnap = await pageQuery.get();
    if (pageSnap.empty) break;
    pageSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      dbUsers.push({
        uid: docSnap.id,
        displayName: (data.displayName as string | undefined) ?? null,
        email: (data.email as string | undefined) ?? null
      });
    });
    scanned += pageSnap.docs.length;
    cursor = pageSnap.docs[pageSnap.docs.length - 1] ?? null;
    if (pageSnap.docs.length < PAGE_SIZE) break;
  }

  // Fallback to Firebase Auth users for email search reliability
  // (covers accounts missing profile docs in `users` collection).
  const authUsersByUid = new Map<string, SearchUser>();
  let authPageToken: string | undefined;
  let authFetched = 0;
  const MAX_AUTH_SCAN = 2000;
  while (authFetched < MAX_AUTH_SCAN) {
    const page = await adminAuth.listUsers(1000, authPageToken);
    page.users.forEach((authUser) => {
      authUsersByUid.set(authUser.uid, {
        uid: authUser.uid,
        displayName: authUser.displayName ?? null,
        email: authUser.email ?? null
      });
    });
    authFetched += page.users.length;
    if (!page.pageToken) break;
    authPageToken = page.pageToken;
  }

  // Merge Firestore profile users with Auth users.
  const mergedByUid = new Map<string, SearchUser>();
  dbUsers.forEach((entry) => mergedByUid.set(entry.uid, entry));
  authUsersByUid.forEach((entry, uid) => {
    if (!mergedByUid.has(uid)) {
      mergedByUid.set(uid, entry);
      return;
    }
    const current = mergedByUid.get(uid) as SearchUser;
    mergedByUid.set(uid, {
      uid,
      displayName: current.displayName ?? entry.displayName ?? null,
      email: current.email ?? entry.email ?? null
    });
  });

  const users = Array.from(mergedByUid.values())
    .filter((entry) => entry.uid !== user.uid)
    .map((entry) => ({ entry, score: scoreMatch(query, entry) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .map((item) => item.entry)
    .slice(0, 10);

  return NextResponse.json({ users });
}
