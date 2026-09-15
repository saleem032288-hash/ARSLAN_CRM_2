/**
 * Broadcast sending modes.
 *
 * Two modes affect the ACTUAL server-side send behavior (never just the
 * UI):
 *
 *   `instant`    — the existing mechanism: the wizard fans the campaign
 *                  out over `/api/whatsapp/broadcast` in batches of 10
 *                  and the route posts each recipient to Meta as fast
 *                  as it can, bounded only by the provider's own limits.
 *   `super_safe` — the server holds every outbound message to ~8/min
 *                  per account using an in-memory token bucket
 *                  (`super-safe-rate-limit.ts`), for deliverability.
 *
 * The chosen mode is stored on the broadcast's existing `audience_filter`
 * jsonb column (no schema change) so that a server-side resume of an
 * abandoned campaign keeps pacing instead of blasting through the
 * leftovers.
 */
export type BroadcastSendingMode = 'instant' | 'super_safe';

export const BROADCAST_SENDING_MODES = ['instant', 'super_safe'] as const;

export const DEFAULT_BROADCAST_SENDING_MODE: BroadcastSendingMode = 'instant';

export function isBroadcastSendingMode(
  value: unknown
): value is BroadcastSendingMode {
  return value === 'instant' || value === 'super_safe';
}

type AudienceFilterLike =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | null
  | undefined;

/**
 * Read the mode off a broadcast's `audience_filter` row. Supabase
 * returns jsonb as an object (or, defensively, a one-element array).
 * Anything missing/unrecognized is treated as `instant` so broadcasts
 * made before this feature existed resume the way they always did.
 */
export function extractSendingMode(
  audienceFilter: AudienceFilterLike
): BroadcastSendingMode {
  const filter = Array.isArray(audienceFilter)
    ? audienceFilter[0]
    : audienceFilter;
  const mode = (filter as Record<string, unknown> | null | undefined)?.mode;
  return isBroadcastSendingMode(mode) ? mode : DEFAULT_BROADCAST_SENDING_MODE;
}