-- ============================================================
-- 047_webhook_heartbeat.sql — make silent Meta webhook drops
-- visible ("it says Connected but nothing arrives")
--
-- Problem this solves:
--   Every prior liveness check on whatsapp_config answers
--   "did WE configure Meta correctly?" — registered_at says /register
--   succeeded (015), subscribed_apps_at says subscribed_apps succeeded
--   (015). None of them answers the question that actually matters
--   when the inbox goes quiet: "has META delivered us ANYTHING,
--   recently?" A field subscription that Meta silently drops (an app
--   migration, a stale WABA → app link, Meta-side outage) leaves all
--   three columns green while the inbox starves — which is exactly
--   how the "messages not landing in inbox" incident of this
--   deployment surfaced.
--
-- Fix: stamp a heartbeat. Every POST /api/whatsapp/webhook that
-- authenticates as this connection (signature verified) touches
-- last_webhook_at BEFORE any processing, so the column answers "when
-- did Meta last successfully reach us?" even when the payload itself
-- carries no processable messages (a status-only or template-only
-- delivery still proves the pipe is open). A stale timestamp is the
-- tell: credentials can be perfect and the timestamp will simply stop
-- advancing — the diagnostic endpoint and the Settings UI now surface
-- that directly.
--
-- The stamp is a fire-and-forget, best-effort update in the route:
--   * never gates message processing,
--   * never blocks the 200 OK ack to Meta,
--   * a dropped stamp degrades to today's behavior, not a broken
--     webhook.
--
-- Kept NULLable with no default so existing rows backfill cleanly:
-- NULL simply means "no authenticated delivery observed yet" and the
-- UI renders that as "unknown / never". Also indexed (partial) to
-- keep a future "find stale connections" admin query cheap.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

-- Partial index matches 015's pattern: cheap to maintain, and the
-- only query that matters filters on the NULL/stale side.
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_last_webhook_at
  ON whatsapp_config (last_webhook_at)
  WHERE last_webhook_at IS NULL;
