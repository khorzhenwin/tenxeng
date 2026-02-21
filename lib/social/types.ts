export type FriendRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  fromDisplayName: string | null;
  fromEmail: string | null;
  toDisplayName: string | null;
  toEmail: string | null;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  expiresAt: string;
};

export type Friendship = {
  id: string;
  members: string[];
  createdAt: string;
  createdBy: string;
};

export type UserBlock = {
  id: string;
  blockerUid: string;
  blockedUid: string;
  createdAt: string;
};

export type PvpChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired";

export type PvpChallenge = {
  id: string;
  challengerUid: string;
  challengedUid: string;
  challengerDisplayName: string | null;
  challengedDisplayName: string | null;
  status: PvpChallengeStatus;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  expiresAt: string;
  pvpSessionId: string | null;
};

export type ConversationType = "direct" | "group" | "system";

export type Conversation = {
  id: string;
  type: ConversationType;
  memberUids: string[];
  title: string | null;
  createdAt: string;
  createdBy: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSenderUid: string | null;
};

export type ConversationMessage = {
  id: string;
  senderUid: string;
  body: string;
  kind: "text";
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type ConversationMember = {
  id: string;
  conversationId: string;
  uid: string;
  lastReadAt: string | null;
  unreadCount: number;
  muted: boolean;
};
