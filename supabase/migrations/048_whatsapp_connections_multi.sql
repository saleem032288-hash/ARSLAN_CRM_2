-- ============================================================
-- 048_whatsapp_connections_multi
--
-- Multi-WhatsApp-connection support: one CRM account may now own
-- N independent WhatsApp Cloud API connections/numbers.
--
-- Design note (important):
--   The existing `whatsapp_config` table ALREADY models exactly one
--   WhatsApp connection (phone_number_id, waba_id, access_token,
--   app_id/app_secret, verify_token, registration + webhook state).
--   Rather than create a duplicate `whatsapp_connections` table and
--   dual-write every one of the ~30 call sites (which the task
--   explicitly warns against), this migration REFACTORS
--   `whatsapp_config` in place into the multi-connection store:
--   it simply drops the one-row-per-account UNIQUE and adds the few
--   descriptive/health columns the UI needs. Every existing query
--   that selects from `whatsapp_config` keeps working; only the
--   handful that assumed a single row (`.single()` / `.maybeSingle()`)
--   are updated in application code to resolve a specific connection.
--
-- What this does:
--   1. Adds descriptive + health columns to `whatsapp_config`.
--   2. Widens the `status` CHECK to carry per-connection health.
--   3. Drops `UNIQUE(account_id)` so an account can have N rows.
--   4. Adds `whatsapp_connection_id` to conversations / messages /
--      broadcasts and `waba_id` to message_templates.
--   5. Backfills every existing row to its account's connection so
--      existing installs keep working with NO reconnect.
--   6. Replaces the one-conversation-per-(account,contact) unique
--      index with one-per-(account,contact,connection).
--   7. Makes merge_duplicate_conversations() connection-aware.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. whatsapp_config: descriptive + health columns
-- ============================================================
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS business_id TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_config.name IS
  'Operator-facing label for this connection (e.g. "ABC Support"). '
  'Defaults to the display/phone when unset.';
COMMENT ON COLUMN whatsapp_config.business_id IS
  'Meta/Facebook Business ID (Business Manager) owning this connection.';
COMMENT ON COLUMN whatsapp_config.phone_number IS
  'The WhatsApp Business phone number in display form (e.g. +92 300 1234567).';
COMMENT ON COLUMN whatsapp_config.display_name IS
  'WhatsApp Business display name as Meta reports it.';
COMMENT ON COLUMN whatsapp_config.profile_picture_url IS
  'Optional per-connection avatar URL. Meta does not expose business '
  'profile pictures via the Cloud API, so this is operator-set; the UI '
  'falls back to an initials avatar when null.';
COMMENT ON COLUMN whatsapp_config.last_error IS
  'Last health/send error observed for THIS connection. Never set on a '
  'healthy connection, so one failing number does not affect the others.';
COMMENT ON COLUMN whatsapp_config.last_health_check_at IS
  'When checkHealth last probed this connection.';

-- ============================================================
-- 2. Widen the status CHECK for per-connection health.
--    'connected' / 'disconnected' keep their existing meaning so
--    every `status === 'connected'` check in the app is unchanged.
-- ============================================================
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_status_check;
ALTER TABLE whatsapp_config ADD CONSTRAINT whatsapp_config_status_check
  CHECK (status IN (
    'connected',
    'disconnected',
    'error',
    'warning',
    'token_expired',
    'webhook_error',
    'invalid_credentials'
  ));

-- ============================================================
-- 3. Drop one-row-per-account UNIQUE.
--
--    Migration 013's UNIQUE(phone_number_id) is intentionally KEPT:
--    a given Meta phone number must map to exactly one connection so
--    the webhook can route it unambiguously.
-- ============================================================
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

-- ============================================================
-- 4. Connection awareness on dependent tables.
--    ON DELETE SET NULL: disconnecting a connection must not delete
--    the customer's conversation history; it just becomes unlinked.
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id UUID
    REFERENCES whatsapp_config(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id UUID
    REFERENCES whatsapp_config(id) ON DELETE SET NULL;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS whatsapp_connection_id UUID
    REFERENCES whatsapp_config(id) ON DELETE SET NULL;

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS waba_id TEXT;

-- ============================================================
-- 5. Backfill: every pre-existing conversation/message/broadcast
--    belongs to its account's WhatsApp number. Pre-upgrade there is
--    exactly one connection per account, so attribution is lossless.
--    (The ROW_NUMBER guard also tolerates a re-run after an operator
--    manually created a second connection.)
-- ============================================================
WITH first_connection AS (
  SELECT account_id, id
  FROM (
    SELECT account_id, id,
           ROW_NUMBER() OVER (
             PARTITION BY account_id ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM whatsapp_config
  ) ranked
  WHERE rn = 1
)
UPDATE conversations c
SET whatsapp_connection_id = fc.id
FROM first_connection fc
WHERE c.account_id = fc.account_id
  AND c.whatsapp_connection_id IS NULL;

UPDATE messages m
SET whatsapp_connection_id = c.whatsapp_connection_id
FROM conversations c
WHERE m.conversation_id = c.id
  AND m.whatsapp_connection_id IS NULL
  AND c.whatsapp_connection_id IS NOT NULL;

WITH first_connection AS (
  SELECT account_id, id
  FROM (
    SELECT account_id, id,
           ROW_NUMBER() OVER (
             PARTITION BY account_id ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM whatsapp_config
  ) ranked
  WHERE rn = 1
)
UPDATE broadcasts b
SET whatsapp_connection_id = fc.id
FROM first_connection fc
WHERE b.account_id = fc.account_id
  AND b.whatsapp_connection_id IS NULL;

-- Stamp existing templates with their account's WABA id.
UPDATE message_templates mt
SET waba_id = wc.waba_id
FROM (
  SELECT DISTINCT ON (account_id) account_id, waba_id
  FROM whatsapp_config
  WHERE waba_id IS NOT NULL
  ORDER BY account_id, created_at ASC
) wc
WHERE mt.account_id = wc.account_id
  AND mt.waba_id IS NULL;

-- Give every legacy connection a readable default name.
UPDATE whatsapp_config
SET name = COALESCE(NULLIF(name, ''), NULLIF(display_name, ''), NULLIF(phone_number, ''), phone_number_id)
WHERE name IS NULL OR name = '';

-- ============================================================
-- 6. Conversation uniqueness becomes per (account, contact,
--    connection) — a customer who messages two of our numbers gets
--    two independent threads (task requirement #13).
--
--    Two partial unique indexes:
--      * non-null connection  → one thread per (account, contact, conn)
--      * null connection      → one legacy/unlinked thread per (account, contact)
-- ============================================================
DROP INDEX IF EXISTS idx_conversations_account_contact;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_conn
  ON conversations (account_id, contact_id, whatsapp_connection_id)
  WHERE whatsapp_connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_noconn
  ON conversations (account_id, contact_id)
  WHERE whatsapp_connection_id IS NULL;

-- ============================================================
-- 7. Indexes for the connection-aware inbox + webhook routing.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_connection
  ON conversations (whatsapp_connection_id);

CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_connection
  ON messages (whatsapp_connection_id);

CREATE INDEX IF NOT EXISTS idx_broadcasts_whatsapp_connection
  ON broadcasts (whatsapp_connection_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_account_created
  ON whatsapp_config (account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_message_templates_account_waba
  ON message_templates (account_id, waba_id);

-- ============================================================
-- 8. RLS: policy set is unchanged (account-membership based), so it
--    already covers N rows per account. Re-affirm select for clarity.
-- ============================================================
DROP POLICY IF EXISTS whatsapp_config_select ON whatsapp_config;
CREATE POLICY whatsapp_config_select ON whatsapp_config FOR SELECT
  USING (is_account_member(account_id));

-- ============================================================
-- 9. make merge_duplicate_conversations() connection-aware so a
--    future re-run never collapses two different numbers' threads.
--    Mirrors migration 036, now grouping by the connection too.
-- ============================================================
CREATE OR REPLACE FUNCTION public.merge_duplicate_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group    RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_all      UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           contact_id,
           whatsapp_connection_id,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids,
           COALESCE(SUM(unread_count), 0)                AS total_unread
    FROM conversations
    GROUP BY account_id, contact_id, whatsapp_connection_id
    HAVING count(*) > 1
  LOOP
    v_all      := v_group.ids;
    v_survivor := v_all[1];
    v_losers   := v_all[2:array_length(v_all, 1)];

    UPDATE messages          SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE message_reactions SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE deals             SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE flow_runs         SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE notifications     SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE ai_usage_log      SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);

    UPDATE conversations c
    SET unread_count      = v_group.total_unread,
        last_message_text = lm.content_text,
        last_message_at   = lm.created_at,
        updated_at        = NOW()
    FROM (
      SELECT content_text, created_at
      FROM messages
      WHERE conversation_id = v_survivor
      ORDER BY created_at DESC
      LIMIT 1
    ) lm
    WHERE c.id = v_survivor;

    UPDATE conversations
    SET unread_count = v_group.total_unread,
        updated_at   = NOW()
    WHERE id = v_survivor
      AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_survivor);

    DELETE FROM conversations WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_conversations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC;
