import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with your App Secret and sends the
 * result in the `x-hub-signature-256: sha256=<hex>` header. Without
 * verification, anyone who knows our webhook URL can POST fabricated
 * status updates and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * Contract:
 *   The candidate secrets are the per-connection App Secrets stored on
 *   each `whatsapp_config` row (migration 043) — a WABA under Meta App B
 *   verifies against B's secret, one under App A against A's, no
 *   environment churn when a new account connects. The webhook route
 *   loads them all and passes them here.
 *
 *   If no explicit secrets are given, we fall back to the legacy
 *   `META_APP_SECRET` env var (comma-separated, issue #500) so
 *   deployments that haven't moved their secrets into the DB keep
 *   working. If BOTH are empty we fail closed — every request is
 *   rejected until a secret is configured. A previous version fell
 *   open with a warning log, which is unsafe for a public template:
 *   anyone who forgets to configure a secret would be running a fully
 *   spoofable webhook.
 *
 *   Each candidate is compared in constant time (no early return).
 *   See docs/multi-waba.md.
 */

/**
 * Split a comma-separated secret list into its candidates: whitespace
 * trimmed, empties dropped. Exported for tests and for anything else
 * that wants to know how many apps are configured.
 */
export function parseAppSecrets(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function signatureMatches(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Verify a Meta webhook signature against one or more candidate
 * secrets.
 *
 * `secrets` — the per-connection App Secrets loaded by the webhook
 * route (decrypted from `whatsapp_config.app_secret`). When empty or
 * omitted, falls back to the legacy `META_APP_SECRET` env var.
 *
 * A request is valid when its signature matches ANY candidate; each
 * candidate is compared in constant time. The loop cost is proportional
 * to the number of configured apps (public knowledge from the
 * operator's point of view), not to the secret contents.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secrets?: readonly string[],
): boolean {
  const candidates =
    secrets && secrets.length > 0
      ? secrets
      : parseAppSecrets(process.env.META_APP_SECRET)
  if (candidates.length === 0) {
    console.error(
      '[webhook] no Meta App Secret is configured — rejecting request. ' +
        'Enter the Meta App Secret in Settings → WhatsApp connection ' +
        '(per-connection, stored encrypted), or set the META_APP_SECRET ' +
        'env var as a fallback (Meta → App Settings → Basic → App Secret).',
    )
    return false
  }

  if (!signatureHeader) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  let ok = false
  for (const secret of candidates) {
    if (signatureMatches(rawBody, signatureHeader, secret)) ok = true
  }
  return ok
}
