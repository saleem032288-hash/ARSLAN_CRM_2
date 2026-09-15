/**
 * Super Safe broadcast pacing — an in-memory token bucket.
 *
 * Holds outbound broadcast messages to `SUPER_SAFE_MESSAGES_PER_MINUTE`
 * per account, shared across every send path (the wizard's
 * `/api/whatsapp/broadcast` loop AND the server-side `deliverBroadcast`
 * fan-out for resumes / the public API). Sharing the bucket means a
 * campaign being resumed while its original send loop is still running
 * cannot exceed the combined rate.
 *
 * Target throughput: ~8 messages/minute.
 *   8   messages →  ~1 min      (0s, 7.5s, 15s, … 52.5s)
 *   16  messages →  ~2 min
 *   80  messages → ~10 min
 *   240 messages → ~30 min
 * Exact timing varies with Meta's response time, retries and provider
 * limits — the bucket only guarantees the floor.
 *
 * The bucket is a token bucket (not the fixed-window counter in
 * `lib/rate-limit.ts`) so the pace is flat rather than burst-then-stop:
 * capacity 1 + refill 8/min means a message can go out immediately when
 * the bucket is fresh, then one arrives every ~7.5s forever. That is
 * deliberately NOT client-side timing — callers on the server `await`
 * this before each Meta request, so the pacing holds even if the
 * browser tab that launched the campaign goes away (a resume keeps
 * pacing via the same bucket).
 *
 * Single-process, like `lib/rate-limit.ts` — a multi-instance deploy
 * needs Redis/Upstash with the same shape (see that file's header).
 * A stale bucket is bounded at 1 token, so a month-old key costs one
 * map entry and a couple of bytes; no cleanup timer required.
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Throughput the bucket is calibrated to. */
export const SUPER_SAFE_MESSAGES_PER_MINUTE = 8;

/** Tokens per millisecond of wall-clock time. */
const REFILL_PER_MS = SUPER_SAFE_MESSAGES_PER_MINUTE / 60_000;

/**
 * Burst capacity. 1 = no burst: with two simultaneous super-safe
 * broadcasts on one account, the second message still waits its turn
 * instead of both dumping an idle bucket's worth at once.
 */
const CAPACITY = 1;

/** Time between two fully-stocked sends, ms (1 / refill rate). */
const TOKEN_INTERVAL_MS = Math.ceil(1 / REFILL_PER_MS);

interface Bucket {
  /** Fractional tokens currently available, in [0, CAPACITY]. */
  tokens: number;
  /** Wall-clock ms of the last refresh. */
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function sleepCeilMs(ms: number): number {
  return Math.max(1, Math.ceil(ms));
}

/**
 * Wait until this account may send one more super-safe message, then
 * consume the token. Resolves immediately when the bucket is stocked;
 * otherwise it sleeps until the next token refills.
 *
 * `key` is the shared-pacing scope — pass the ACCOUNT id so all of one
 * account's super-safe sends (wizard + resume + API) share one rate.
 */
export async function awaitSuperSafeToken(key: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket) {
      // First message of a fresh bucket: consume the starting token.
      buckets.set(key, { tokens: CAPACITY - 1, lastRefill: now });
      return;
    }

    bucket.tokens = Math.min(
      CAPACITY,
      bucket.tokens + (now - bucket.lastRefill) * REFILL_PER_MS
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    const waitMs = (1 - bucket.tokens) / REFILL_PER_MS;
    await sleep(sleepCeilMs(waitMs));
  }
}

/**
 * How long the next super-safe send would have to wait, ms — used by
 * tests to assert the ~8/min cadence without racing wall-clock time.
 */
export function superSafeWaitUntilReadyMs(key: string): number {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  const tokens = Math.min(CAPACITY, bucket.tokens + (now - bucket.lastRefill) * REFILL_PER_MS);
  if (tokens >= 1) return 0;
  return sleepCeilMs((1 - tokens) / REFILL_PER_MS);
}

export function __resetSuperSafeRateLimitForTests(): void {
  buckets.clear();
}

export { TOKEN_INTERVAL_MS };