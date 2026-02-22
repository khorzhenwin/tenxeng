"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import type {
  Conversation,
  ConversationMember,
  ConversationMessage
} from "@/lib/social/types";

type FriendListItem = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

type ConversationsPayload = {
  conversations: Conversation[];
  members: ConversationMember[];
};

type MessagesPayload = {
  messages: ConversationMessage[];
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type ChatBubbleProps = {
  user: User;
};

export default function ChatBubble({ user }: ChatBubbleProps) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [compose, setCompose] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTargetUid, setNewTargetUid] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const memberByConversationId = useMemo(() => {
    const map = new Map<string, ConversationMember>();
    members.forEach((member) => {
      map.set(member.conversationId, member);
    });
    return map;
  }, [members]);

  const friendByUid = useMemo(() => {
    const map = new Map<string, FriendListItem>();
    friends.forEach((friend) => map.set(friend.uid, friend));
    return map;
  }, [friends]);
  const existingConversationTargetUids = useMemo(() => {
    const set = new Set<string>();
    conversations.forEach((conversation) => {
      const targetUid = conversation.memberUids.find((uid) => uid !== user.uid);
      if (targetUid) {
        set.add(targetUid);
      }
    });
    return set;
  }, [conversations, user.uid]);
  const availableNewDmFriends = useMemo(
    () => friends.filter((friend) => !existingConversationTargetUids.has(friend.uid)),
    [friends, existingConversationTargetUids]
  );

  const unreadCount = useMemo(
    () =>
      members.reduce((acc, member) => acc + Math.max(0, member.unreadCount ?? 0), 0),
    [members]
  );
  const unreadNotifications = useMemo(
    () => notifications.filter((entry) => !entry.readAt).length,
    [notifications]
  );

  const loadFriends = useCallback(async () => {
    const response = await fetch("/api/friends");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { friends: FriendListItem[] };
    setFriends(payload.friends ?? []);
    if (!newTargetUid && payload.friends?.length) {
      setNewTargetUid(payload.friends[0].uid);
    }
  }, [newTargetUid]);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/conversations");
      if (!response.ok) {
        if (response.status === 429) {
          return;
        }
        const text = await response.text();
        throw new Error(text || "Unable to load conversations.");
      }
      const payload = (await response.json()) as ConversationsPayload;
      setConversations(payload.conversations ?? []);
      setMembers(payload.members ?? []);
      if (!selectedConversationId && payload.conversations?.length) {
        setSelectedConversationId(payload.conversations[0].id);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load.";
      if (message.toLowerCase().includes("too many requests")) {
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [selectedConversationId]);

  const loadNotifications = useCallback(async () => {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const payload = (await response.json()) as { notifications: NotificationItem[] };
    setNotifications(payload.notifications ?? []);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await fetch(
      `/api/chat/conversations/${conversationId}/messages?limit=60`
    );
    if (!response.ok) {
      if (response.status === 429) {
        return;
      }
      const text = await response.text();
      throw new Error(text || "Unable to load messages.");
    }
    const payload = (await response.json()) as MessagesPayload;
    setMessages(payload.messages ?? []);
    await fetch(`/api/chat/conversations/${conversationId}/read`, { method: "POST" });
  }, []);

  const openOrCreateConversation = useCallback(
    async (targetUid: string) => {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid })
      });
      if (!response.ok) {
        if (response.status === 429) {
          return;
        }
        const text = await response.text();
        throw new Error(text || "Unable to open conversation.");
      }
      const payload = (await response.json()) as { conversationId: string };
      setSelectedConversationId(payload.conversationId);
      await loadConversations();
      await loadMessages(payload.conversationId);
      setOpen(true);
    },
    [loadConversations, loadMessages]
  );

  useEffect(() => {
    loadFriends();
    loadConversations();
    loadNotifications();
  }, [loadFriends, loadConversations, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const poller = setInterval(() => {
      loadConversations();
      if (selectedConversationId) {
        loadMessages(selectedConversationId).catch(() => undefined);
        fetch(`/api/chat/conversations/${selectedConversationId}/typing`)
          .then((response) => response.json())
          .then((payload) =>
            setTypingUsers((payload?.typingUsers as string[] | undefined) ?? [])
          )
          .catch(() => undefined);
      }
      loadNotifications().catch(() => undefined);
    }, 5000);
    return () => clearInterval(poller);
  }, [loadConversations, loadMessages, open, selectedConversationId, loadNotifications]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ uid?: string }>).detail;
      const targetUid = detail?.uid;
      if (targetUid) {
        openOrCreateConversation(targetUid).catch(() => undefined);
        return;
      }
      setOpen(true);
    };
    window.addEventListener("tenxeng:chat-open", onOpen);
    return () => window.removeEventListener("tenxeng:chat-open", onOpen);
  }, [openOrCreateConversation]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedConversationId).catch((messageError) => {
      setError(
        messageError instanceof Error
          ? messageError.message
          : "Unable to load messages."
      );
    });
  }, [loadMessages, selectedConversationId]);
  useEffect(() => {
    if (!newTargetUid) return;
    if (existingConversationTargetUids.has(newTargetUid)) {
      setNewTargetUid("");
    }
  }, [existingConversationTargetUids, newTargetUid]);

  const sendMessage = async () => {
    const content = compose.trim();
    if (!selectedConversationId || !content) return;
    setCompose("");
    const response = await fetch(
      `/api/chat/conversations/${selectedConversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: content })
      }
    );
    if (!response.ok) {
      if (response.status === 429) {
        return;
      }
      const text = await response.text();
      setError(text || "Unable to send message.");
      return;
    }
    await Promise.all([
      loadMessages(selectedConversationId),
      loadConversations()
    ]).catch(() => undefined);
  };

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!selectedConversationId) return;
      await fetch(`/api/chat/conversations/${selectedConversationId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTyping })
      });
    },
    [selectedConversationId]
  );

  const sendChallenge = async () => {
    if (!selectedConversationId) return;
    const activeConversation = conversations.find(
      (entry) => entry.id === selectedConversationId
    );
    const targetUid = activeConversation?.memberUids.find((uid) => uid !== user.uid);
    if (!targetUid) return;
    const response = await fetch("/api/pvp/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengedUid: targetUid })
    });
    if (!response.ok) {
      if (response.status === 429) {
        return;
      }
      const text = await response.text();
      setError(text || "Unable to send challenge.");
      return;
    }
  };

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );
  const selectedTargetUid =
    selectedConversation?.memberUids.find((uid) => uid !== user.uid) ?? null;
  const selectedFriend = selectedTargetUid
    ? friendByUid.get(selectedTargetUid)
    : null;
  const selectedTargetMember = selectedConversationId
    ? memberByConversationId.get(selectedConversationId)
    : null;
  const lastMessage = messages[messages.length - 1] ?? null;
  const seenByFriend =
    !!lastMessage &&
    lastMessage.senderUid === user.uid &&
    !!selectedTargetMember?.lastReadAt &&
    Date.parse(selectedTargetMember.lastReadAt) >= Date.parse(lastMessage.createdAt);
  const selfLabel = user.displayName ?? user.email ?? "You";

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-[color:var(--background)] sm:inset-auto sm:bottom-4 sm:right-4 sm:bg-transparent"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-0 h-[100svh] overflow-hidden bg-[color:var(--background)] shadow-2xl sm:static sm:h-[28rem] sm:w-[22rem] sm:max-w-[calc(100vw-1rem)] sm:rounded-2xl sm:border sm:border-[color:var(--border)] sm:bg-[color:var(--surface)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Messages
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selfLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNotifications((prev) => !prev)}
                    className="rounded-full border border-[color:var(--border)] px-2 py-1 text-xs text-slate-600 hover:border-slate-400 dark:text-slate-300"
                  >
                    Notifications
                    {unreadNotifications > 0 ? ` (${unreadNotifications})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-[color:var(--border)] px-2 py-1 text-xs text-slate-600 hover:border-slate-400 dark:text-slate-300"
                  >
                    Close
                  </button>
                </div>
              </div>
              {showNotifications ? (
                <div className="max-h-36 overflow-y-auto border-b border-[color:var(--border)] px-3 py-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No notifications yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.slice(0, 10).map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-2 py-2 text-xs"
                        >
                          <p className="font-semibold text-slate-700 dark:text-slate-200">
                            {entry.title}
                          </p>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">
                            {entry.body}
                          </p>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        onClick={async () => {
                          await fetch("/api/notifications/read", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ markAll: true })
                          });
                          loadNotifications().catch(() => undefined);
                        }}
                      >
                        Mark all as read
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {error ? (
                <p className="px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <div className="hidden max-h-[42%] border-b border-[color:var(--border)] p-2 sm:block sm:max-h-none sm:w-2/5 sm:border-b-0 sm:border-r">
                  <select
                    value={newTargetUid}
                    onChange={(event) => setNewTargetUid(event.target.value)}
                    className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="">New DM...</option>
                    {availableNewDmFriends.map((friend) => (
                      <option key={friend.uid} value={friend.uid}>
                        {friend.displayName ?? friend.email ?? "Unknown user"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!newTargetUid}
                    onClick={() => {
                      if (!newTargetUid) return;
                      openOrCreateConversation(newTargetUid).catch((openError) => {
                        setError(
                          openError instanceof Error
                            ? openError.message
                            : "Unable to open conversation."
                        );
                      });
                    }}
                    className="mt-2 w-full rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                  >
                    Open
                  </button>
                  <div className="mt-2 max-h-[11rem] space-y-1 overflow-y-auto sm:max-h-none">
                    {loading ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Loading...
                      </p>
                    ) : conversations.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No conversations yet.
                      </p>
                    ) : (
                      conversations.map((conversation) => {
                        const targetUid =
                          conversation.memberUids.find((uid) => uid !== user.uid) ?? null;
                        const friend = targetUid ? friendByUid.get(targetUid) : null;
                        const label =
                          friend?.displayName ?? friend?.email ?? "Unknown user";
                        const unread =
                          memberByConversationId.get(conversation.id)?.unreadCount ?? 0;
                        return (
                          <button
                            key={conversation.id}
                            type="button"
                            onClick={() => setSelectedConversationId(conversation.id)}
                            className={`w-full rounded-lg border px-2 py-2 text-left text-xs ${
                              selectedConversationId === conversation.id
                                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                                : "border-[color:var(--border)] text-slate-700 hover:border-slate-400 dark:text-slate-200"
                            }`}
                          >
                            <p className="truncate font-semibold">{label}</p>
                            <p className="mt-1 truncate opacity-80">
                              {conversation.lastMessage ?? "Say hi"}
                            </p>
                            {unread > 0 ? <p className="mt-1">Unread: {unread}</p> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col sm:w-3/5">
                  <div className="border-b border-[color:var(--border)] p-2 sm:hidden">
                    <select
                      value={selectedConversationId ? `conv:${selectedConversationId}` : ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) {
                          setSelectedConversationId(null);
                          return;
                        }
                        if (value.startsWith("conv:")) {
                          setSelectedConversationId(value.replace("conv:", ""));
                          return;
                        }
                        if (value.startsWith("user:")) {
                          const uid = value.replace("user:", "");
                          setNewTargetUid(uid);
                          openOrCreateConversation(uid).catch((openError) => {
                            setError(
                              openError instanceof Error
                                ? openError.message
                                : "Unable to open conversation."
                            );
                          });
                        }
                      }}
                      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                    >
                      <option value="">Select or start a chat...</option>
                      {conversations.length > 0 ? (
                        <optgroup label="Chats">
                          {conversations.map((conversation) => {
                            const targetUid =
                              conversation.memberUids.find((uid) => uid !== user.uid) ??
                              null;
                            const friend = targetUid ? friendByUid.get(targetUid) : null;
                            const label =
                              friend?.displayName ?? friend?.email ?? "Unknown user";
                            return (
                              <option
                                key={`conv-${conversation.id}`}
                                value={`conv:${conversation.id}`}
                              >
                                {label}
                              </option>
                            );
                          })}
                        </optgroup>
                      ) : null}
                      {availableNewDmFriends.length > 0 ? (
                        <optgroup label="Start new chat">
                          {availableNewDmFriends.map((friend) => (
                            <option key={`user-${friend.uid}`} value={`user:${friend.uid}`}>
                              {friend.displayName ?? friend.email ?? "Unknown user"}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </div>
                  <div className="flex items-center justify-between border-b border-[color:var(--border)] px-2 py-1">
                    <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {selectedConversationId
                        ? selectedFriend?.displayName ??
                          selectedFriend?.email ??
                          "Unknown user"
                        : "Select a chat"}
                    </p>
                    <button
                      type="button"
                      disabled={!selectedConversationId}
                      onClick={sendChallenge}
                      className="rounded-full border border-[color:var(--border)] px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                    >
                      Challenge
                    </button>
                  </div>
                  <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[90%] rounded-xl px-2 py-1 text-xs ${
                          message.senderUid === user.uid
                            ? "ml-auto bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-[color:var(--surface-muted)] text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {message.body}
                      </div>
                    ))}
                    {typingUsers.length > 0 ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Typing...
                      </p>
                    ) : null}
                  </div>
                  <div className="border-t border-[color:var(--border)] p-2">
                    <div className="flex gap-2">
                      <input
                        value={compose}
                        onChange={(event) => {
                          const next = event.target.value;
                          setCompose(next);
                          setTyping(next.trim().length > 0).catch(() => undefined);
                        }}
                        placeholder="Type a message..."
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none dark:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={!selectedConversationId || compose.trim().length === 0}
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                      >
                        Send
                      </button>
                    </div>
                    {seenByFriend ? (
                      <p className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">
                        Seen
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={
            unreadCount > 0 ? `Open chat (${unreadCount} unread)` : "Open chat"
          }
          className="fixed bottom-4 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
