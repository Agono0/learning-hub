# Remote leagues: threat model

Status: inactive groundwork. Remote leagues are local/friendly PRACTICE. Elo is
frozen, points are "local activity scoring", and nothing here claims a
competitive-ready or verified-skill ranking. The worker routes to the league
room only when `LEAGUES_ENABLED` is exactly `"true"`, and the web API only when
`LH_REMOTE_LEAGUES === '1'`. Both ship unset.

## What a signature proves

A signed mutation proves that the holder of one device key (ECDSA P-256) sent
that exact payload to that exact league at roughly that time. It does not
prove that the person answered unaided, that they studied, or that the client
graded honestly. Answers are checked by the room against the prompts the
challenger authored, but the player's device still chooses what to send.

## Assets

- League state in the room: members, aliases, duels, accepted-mutation ledger.
- Each member's signing key (never leaves their device).
- The local queue of unsent mutations (SQLite, single-tenant `default` owner).

## Attackers considered

| Attacker | Goal | Control |
| --- | --- | --- |
| Network observer | Replay a captured envelope | Per-signer monotonic `seq`, nonce ledger, clock window |
| Unsigned caller | Learn a member's sequence | `bad_seq` hint only after the signature verifies |
| Member | Act as another member | Handle derived from the public key; envelopes bind league id and domain |
| Member | Flood the room | Rate limit per signer window, body size cap, bounded duel retention |
| Member | Inflate points | Points come only from the reducer; no client-supplied totals |
| Challenger | Hide answers from the opponent | Public views omit accepted answers and timing flags |
| Spectator | Harvest keys | `/spectate` returns aliases and counts only |
| Corrupt local queue | Wedge syncing | Queue loads through a schema; a bad document resets to empty and reports `recovered` |

## Explicit non-goals

- Anti-cheat. Client-controlled grading is an honor system. Exactly-once
  application of a mutation is not evidence of honest play.
- Multi-tenant isolation. The app is single-tenant (`default` owner).
- Key recovery. A lost key is a lost identity in that league. We never
  reassign an existing account id to a new key; the register-key path returns
  the stored id for a known key and does not rewrite legacy ids.
- Timing as proof. Plausibility flags are advisory counts and never gate or
  punish a member.

## Operational limits

- Clock skew window and nonce retention are constants in
  `packages/core/src/leagues/signed.ts`. A device whose clock is far off gets a
  `bad_timestamp` code and must fix its clock; the queue keeps the item.
- A failed storage write leaves memory and storage unchanged and returns 503.
- Duels are pruned on commit so a long-lived league stays bounded.

## Residual risks

1. A member can script answers. Mitigation is social: leagues are friendly.
2. The ledger of nonces is bounded; an envelope older than the retention window
   is rejected by the clock window, not the ledger. Both limits must move
   together if either changes.
3. Aliases are display-only and unmoderated. They are never used for identity.

## Before any activation

Turning this on, deploying the Durable Object and binding it are the owner's
decisions. Review this document, the free-tier limits, and the retarget notes
for the base branch (`feat/competitive-leagues`) first.
