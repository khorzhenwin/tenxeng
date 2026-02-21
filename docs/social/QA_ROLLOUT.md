# QA and Rollout Checklist

## Functional QA
- Friend request send, accept, decline, cancel.
- Duplicate request prevention between same user pair.
- Remove friend and block/unblock actions.
- Challenge send, accept, decline, and PvP session creation after accept.
- Rematch challenge action from PvP history.
- DM creation and message send/receive in chat bubble.

## Security QA
- Verify unauthorized users cannot call protected social endpoints.
- Verify non-participants cannot read conversation messages.
- Verify blocked users cannot create friend request/challenge/DM.

## Performance QA
- Verify UI polling intervals match documented cadence.
- Verify endpoint returns `429` when called >1 RPS.
- Verify dashboard and chat remain responsive with larger friend/conversation lists.

## Rollout Plan
1. Deploy API + schema/rules/index updates.
2. Deploy dashboard social tab and chat bubble behind feature flag if needed.
3. Monitor errors for `429`, `403`, `409`, and Firestore index/rule issues.
4. Gradually enable for all users and monitor engagement metrics.
