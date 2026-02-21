"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { FriendRequest, PvpChallenge, UserBlock } from "@/lib/social/types";

type FriendListItem = {
  uid: string;
  displayName: string | null;
  email: string | null;
  lastActiveAt: string | null;
};

type SocialResponse = {
  friends: FriendListItem[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blocks: UserBlock[];
};

type ChallengeInboxResponse = {
  incoming: PvpChallenge[];
  outgoing: PvpChallenge[];
};

type SearchResponse = {
  users: FriendListItem[];
};

type SocialPanelProps = {
  user: User;
  onOpenPvpSession: (sessionId: string) => void;
};

export default function SocialPanel({ user, onOpenPvpSession }: SocialPanelProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [incomingChallenges, setIncomingChallenges] = useState<PvpChallenge[]>([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState<PvpChallenge[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentlySentUid, setRecentlySentUid] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const loadSocial = useCallback(async () => {
    if (hasLoadedRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [friendsResponse, challengesResponse] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/pvp/challenges/inbox")
      ]);
      if (!friendsResponse.ok) {
        if (friendsResponse.status === 429) {
          return;
        }
        const text = await friendsResponse.text();
        throw new Error(text || "Unable to load friends.");
      }
      if (!challengesResponse.ok) {
        if (challengesResponse.status === 429) {
          return;
        }
        const text = await challengesResponse.text();
        throw new Error(text || "Unable to load challenges.");
      }
      const friendsPayload = (await friendsResponse.json()) as SocialResponse;
      const challengePayload =
        (await challengesResponse.json()) as ChallengeInboxResponse;
      setFriends(friendsPayload.friends ?? []);
      setIncomingRequests(friendsPayload.incomingRequests ?? []);
      setOutgoingRequests(friendsPayload.outgoingRequests ?? []);
      setBlocks(friendsPayload.blocks ?? []);
      setIncomingChallenges(challengePayload.incoming ?? []);
      setOutgoingChallenges(challengePayload.outgoing ?? []);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load.";
      if (message.toLowerCase().includes("too many requests")) {
        return;
      }
      setError(message);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSocial();
    const poller = setInterval(loadSocial, 20000);
    return () => clearInterval(poller);
  }, [loadSocial]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const run = async () => {
      setSearchLoading(true);
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          // Keep current results on 429 to avoid flashing "No user found"
          // while user is still typing.
          if (response.status === 429) {
            return;
          }
          if (!cancelled) {
            setSearchResults([]);
          }
          return;
        }
        const payload = (await response.json()) as SearchResponse;
        if (!cancelled) {
          setSearchResults(payload.users ?? []);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };
    const timer = setTimeout(run, 350);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const friendSet = useMemo(() => new Set(friends.map((entry) => entry.uid)), [friends]);
  const blockedSet = useMemo(
    () => new Set(blocks.map((entry) => entry.blockedUid)),
    [blocks]
  );
  const outgoingSet = useMemo(
    () => new Set(outgoingRequests.map((entry) => entry.toUid)),
    [outgoingRequests]
  );

  const runAction = useCallback(
    async (id: string, action: () => Promise<void>) => {
      setActionLoading(id);
      setNotice(null);
      try {
        await action();
        await loadSocial();
      } catch (actionError) {
        const message =
          actionError instanceof Error
            ? actionError.message
            : "Unable to process request.";
        if (message.toLowerCase().includes("too many requests")) {
          return;
        }
        setNotice(
          message
        );
      } finally {
        setActionLoading(null);
      }
    },
    [loadSocial]
  );

  const sendFriendRequest = async (targetUid: string) => {
    await runAction(`send-${targetUid}`, async () => {
      const response = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to send friend request.");
      }
      const target = searchResults.find((entry) => entry.uid === targetUid);
      setRecentlySentUid(targetUid);
      setNotice(
        `Friend request sent to ${target?.displayName ?? target?.email ?? targetUid}.`
      );
    });
  };

  const challengeFriend = async (challengedUid: string) => {
    await runAction(`challenge-${challengedUid}`, async () => {
      const response = await fetch("/api/pvp/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengedUid })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to send challenge.");
      }
      setNotice("Challenge sent.");
    });
  };

  const startChat = (uid: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("tenxeng:chat-open", { detail: { uid } }));
    setNotice("Chat opened.");
  };

  if (loading) {
    return (
      <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading social features...
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Social</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add friends, challenge them, and message them from chat.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSocial}
          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-200">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{notice}</p>
      ) : null}

      <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Add friend
        </p>
        <input
          className="mt-3 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none dark:text-slate-200"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by name, email, or uid"
        />
        <div className="mt-3 space-y-2">
          {searchQuery.trim().length >= 2 && searchLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Searching users...
            </p>
          ) : null}
          {searchQuery.trim().length >= 2 &&
          !searchLoading &&
          searchResults.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No user found. Try another email, name, or uid.
            </p>
          ) : null}
          {searchResults.map((result) => {
            const isFriend = friendSet.has(result.uid);
            const isBlocked = blockedSet.has(result.uid);
            const isPending = outgoingSet.has(result.uid);
            const isJustSent = recentlySentUid === result.uid;
            const label = result.displayName ?? result.email ?? result.uid;
            return (
              <div
                key={result.uid}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {result.uid}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    isFriend ||
                    isBlocked ||
                    isPending ||
                    isJustSent ||
                    actionLoading === `send-${result.uid}`
                  }
                  onClick={() => sendFriendRequest(result.uid)}
                  className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                >
                  {isFriend
                    ? "Friends"
                    : isBlocked
                    ? "Blocked"
                    : isPending
                    ? "Pending"
                    : isJustSent
                    ? "Request sent"
                    : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Friend requests ({incomingRequests.length})
          </p>
          <div className="mt-3 space-y-2">
            {incomingRequests.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No incoming requests.
              </p>
            ) : (
              incomingRequests.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-sm"
                >
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {entry.fromDisplayName ?? entry.fromEmail ?? entry.fromUid}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionLoading === `accept-${entry.id}`}
                      onClick={() =>
                        runAction(`accept-${entry.id}`, async () => {
                          const response = await fetch(
                            `/api/friends/request/${entry.id}/accept`,
                            { method: "POST" }
                          );
                          if (!response.ok) {
                            const text = await response.text();
                            throw new Error(text || "Unable to accept request.");
                          }
                        })
                      }
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === `decline-${entry.id}`}
                      onClick={() =>
                        runAction(`decline-${entry.id}`, async () => {
                          const response = await fetch(
                            `/api/friends/request/${entry.id}/decline`,
                            { method: "POST" }
                          );
                          if (!response.ok) {
                            const text = await response.text();
                            throw new Error(text || "Unable to decline request.");
                          }
                        })
                      }
                      className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Incoming challenges ({incomingChallenges.length})
          </p>
          <div className="mt-3 space-y-2">
            {incomingChallenges.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No incoming challenges.
              </p>
            ) : (
              incomingChallenges.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-sm"
                >
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {entry.challengerDisplayName ?? entry.challengerUid}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionLoading === `accept-challenge-${entry.id}`}
                      onClick={() =>
                        runAction(`accept-challenge-${entry.id}`, async () => {
                          const response = await fetch(
                            `/api/pvp/challenges/${entry.id}/accept`,
                            { method: "POST" }
                          );
                          if (!response.ok) {
                            const text = await response.text();
                            throw new Error(text || "Unable to accept challenge.");
                          }
                          const payload = (await response.json()) as {
                            sessionId: string;
                          };
                          onOpenPvpSession(payload.sessionId);
                        })
                      }
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading === `decline-challenge-${entry.id}`}
                      onClick={() =>
                        runAction(`decline-challenge-${entry.id}`, async () => {
                          const response = await fetch(
                            `/api/pvp/challenges/${entry.id}/decline`,
                            { method: "POST" }
                          );
                          if (!response.ok) {
                            const text = await response.text();
                            throw new Error(text || "Unable to decline challenge.");
                          }
                        })
                      }
                      className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Friends ({friends.length})
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Outgoing requests: {outgoingRequests.length} · Outgoing challenges:{" "}
            {outgoingChallenges.length}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {friends.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add your first friend to start challenging and chatting.
            </p>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.uid}
                className="flex flex-col gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {friend.displayName ?? friend.email ?? friend.uid}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {friend.uid}
                    {" · "}
                    {(() => {
                      if (!friend.lastActiveAt) return "offline";
                      const delta = Date.now() - Date.parse(friend.lastActiveAt);
                      if (delta <= 2 * 60 * 1000) return "online";
                      if (delta <= 10 * 60 * 1000) return "recently active";
                      return "offline";
                    })()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionLoading === `challenge-${friend.uid}`}
                    onClick={() => challengeFriend(friend.uid)}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    Challenge
                  </button>
                  <button
                    type="button"
                    onClick={() => startChat(friend.uid)}
                    className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                  >
                    Message
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === `remove-${friend.uid}`}
                    onClick={() =>
                      runAction(`remove-${friend.uid}`, async () => {
                        const response = await fetch(
                          `/api/friends/${friend.uid}/remove`,
                          { method: "POST" }
                        );
                        if (!response.ok) {
                          const text = await response.text();
                          throw new Error(text || "Unable to remove friend.");
                        }
                      })
                    }
                    className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === `block-${friend.uid}`}
                    onClick={() =>
                      runAction(`block-${friend.uid}`, async () => {
                        const response = await fetch(
                          `/api/friends/${friend.uid}/block`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "block" })
                          }
                        );
                        if (!response.ok) {
                          const text = await response.text();
                          throw new Error(text || "Unable to block user.");
                        }
                      })
                    }
                    className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-500 dark:border-rose-500/60 dark:text-rose-300"
                  >
                    Block
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {blocks.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Blocked users
          </p>
          <div className="mt-3 space-y-2">
            {blocks.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
              >
                <p className="text-slate-700 dark:text-slate-200">{entry.blockedUid}</p>
                <button
                  type="button"
                  disabled={actionLoading === `unblock-${entry.blockedUid}`}
                  onClick={() =>
                    runAction(`unblock-${entry.blockedUid}`, async () => {
                      const response = await fetch(
                        `/api/friends/${entry.blockedUid}/block`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "unblock" })
                        }
                      );
                      if (!response.ok) {
                        const text = await response.text();
                        throw new Error(text || "Unable to unblock user.");
                      }
                    })
                  }
                  className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 dark:text-slate-200"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Signed in as {user.displayName ?? user.email ?? user.uid}
      </p>
    </section>
  );
}
