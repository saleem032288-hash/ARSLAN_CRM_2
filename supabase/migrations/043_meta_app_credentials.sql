-- ============================================================
-- 043_meta_app_credentials
--
-- Per-connection Meta App credentials. Before this migration the Meta
-- App ID and App Secret lived in server environment variables
-- (`META_APP_ID`, `META_APP_SECRET`), shared across every account on a
-- deployment. Connecting a WABA that lives under a different Meta App
-- meant editing .env, restarting, and redeploying the app.
--
-- This adds two columns to `whatsapp_config` so each connection keeps
-- its own App credentials:
--
--   * `app_id`     — the numeric Meta App ID. Not secret (it appears in
--                    the dashboard) and stored in plaintext.
--   * `app_secret` — the Meta App Secret. Encrypted server-side with
--                    AES-256-GCM via the same `encrypt()` / `decrypt()`
--                    helpers used for `access_token` (ENCRYPTION_KEY).
--                    It is never returned to the browser.
--
-- The webhook verifies every inbound `X-Hub-Signature-256` against the
-- union of these stored secrets (plus the env var as a fallback for
-- deployments that have not moved their secrets yet), so one callback
-- URL keeps serving WABAs under many Meta Apps with zero env churn.
--
-- Both columns are nullable — legacy rows and rows saved purely against
-- an env fallback secret keep working.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS app_secret TEXT;

COMMENT ON COLUMN whatsapp_config.app_id IS
  'Numeric Meta App ID owning this connection. Plaintext — it is public '
  'in the Meta dashboard. Used for Resumable-Upload media-header templates '
  'and for checking the WABA is subscribed to the right app.';

COMMENT ON COLUMN whatsapp_config.app_secret IS
  'Meta App Secret for this connection, AES-256-GCM-encrypted with '
  'ENCRYPTION_KEY (same scheme as access_token). The webhook verifies '
  'inbound HMAC signatures against the decrypted value. Never returned '
  'to the browser.';