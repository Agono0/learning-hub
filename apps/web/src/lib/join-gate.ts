/**
 * Decides what a study-room socket may send on each open.
 *
 * - First open: the assertion the caller just fetched. An object means verified, an explicit
 *   `null` means the device has no key and joins anonymously, `undefined` (key missing) fails closed.
 * - Every later open (reconnect): a FRESH assertion is fetched, never the spent one. A fetch
 *   failure or a missing key fails closed.
 * - Sticky: once a verified object has been seen, `null`/missing/failed on a later open fails
 *   closed. It never downgrades to anonymous. A later object upgrades an anonymous session and
 *   then sticks.
 * No retry policy: a failure is returned to the caller once.
 */
export type JoinDecision = { send: true; proof: unknown | null } | { send: false }

export interface JoinGate {
  /** Called on every socket open. Resolves with what to send, or `{send:false}` to fail closed. */
  decide(): Promise<JoinDecision>
}

export function createJoinGate(
  initial: unknown,
  fetchFresh: () => Promise<{ joinAssertion?: unknown } | null | undefined>,
): JoinGate {
  let first = true
  let verified = false

  const settle = (proof: unknown): JoinDecision => {
    if (proof && typeof proof === 'object') {
      verified = true
      return { send: true, proof }
    }
    if (proof === null && !verified) return { send: true, proof: null }
    return { send: false }
  }

  return {
    async decide() {
      if (first) {
        first = false
        return settle(initial)
      }
      try {
        const data = await fetchFresh()
        if (!data || !('joinAssertion' in data)) return { send: false }
        return settle(data.joinAssertion)
      } catch {
        return { send: false }
      }
    },
  }
}

/**
 * Runs one open: asks the gate, then acts only if this socket is still the current one when the
 * (possibly slow) fetch settles. A stale completion neither sends a join nor shows a refusal.
 */
export async function runJoinOnOpen(
  gate: JoinGate,
  isCurrent: () => boolean,
  actions: { send: (proof: unknown | null) => void; failClosed: () => void },
): Promise<void> {
  const d = await gate.decide()
  if (!isCurrent()) return
  if (d.send) actions.send(d.proof)
  else actions.failClosed()
}
