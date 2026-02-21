import { adminDb } from "@/lib/firebase/admin";

export function sortUidPair(firstUid: string, secondUid: string): [string, string] {
  return [firstUid, secondUid].sort((a, b) => a.localeCompare(b)) as [
    string,
    string
  ];
}

export function friendshipIdForUsers(firstUid: string, secondUid: string): string {
  const [uidA, uidB] = sortUidPair(firstUid, secondUid);
  return `${uidA}_${uidB}`;
}

export function directConversationIdForUsers(
  firstUid: string,
  secondUid: string
): string {
  const [uidA, uidB] = sortUidPair(firstUid, secondUid);
  return `direct_${uidA}_${uidB}`;
}

export function blockIdForUsers(blockerUid: string, blockedUid: string): string {
  return `${blockerUid}_${blockedUid}`;
}

export async function getUserIdentity(uid: string): Promise<{
  uid: string;
  displayName: string | null;
  email: string | null;
  lastActiveAt: string | null;
}> {
  const userSnap = await adminDb.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return { uid, displayName: null, email: null, lastActiveAt: null };
  }
  const data = userSnap.data();
  return {
    uid,
    displayName: (data?.displayName as string | undefined) ?? null,
    email: (data?.email as string | undefined) ?? null,
    lastActiveAt: (data?.lastActiveAt as string | undefined) ?? null
  };
}

export async function usersAreFriends(
  firstUid: string,
  secondUid: string
): Promise<boolean> {
  const id = friendshipIdForUsers(firstUid, secondUid);
  const snap = await adminDb.collection("friendships").doc(id).get();
  return snap.exists;
}

export async function hasBlockRelationship(
  firstUid: string,
  secondUid: string
): Promise<boolean> {
  const [firstBlock, secondBlock] = await Promise.all([
    adminDb
      .collection("blocks")
      .doc(blockIdForUsers(firstUid, secondUid))
      .get(),
    adminDb
      .collection("blocks")
      .doc(blockIdForUsers(secondUid, firstUid))
      .get()
  ]);
  return firstBlock.exists || secondBlock.exists;
}
