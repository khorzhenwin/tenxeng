import { adminDb } from "@/lib/firebase/admin";

export type SocialNotificationType =
  | "friend_request"
  | "friend_request_accepted"
  | "pvp_challenge"
  | "pvp_challenge_accepted"
  | "chat_message";

export async function createSocialNotification(input: {
  uid: string;
  type: SocialNotificationType;
  title: string;
  body: string;
  actorUid: string | null;
  entityId: string | null;
}) {
  const ref = adminDb.collection("notifications").doc();
  const now = new Date().toISOString();
  await ref.set({
    id: ref.id,
    uid: input.uid,
    type: input.type,
    title: input.title,
    body: input.body,
    actorUid: input.actorUid,
    entityId: input.entityId,
    createdAt: now,
    readAt: null
  });
}
