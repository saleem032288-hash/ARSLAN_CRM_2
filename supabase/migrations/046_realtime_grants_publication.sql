-- ============================================================
-- 046_realtime_grants_publication.sql — inbox tag refresh is
-- dead + two missing function grants
--
-- Three independent fixes surfaced by the production-readiness
-- audit (same "applies cleanly but does nothing" class that
-- verify-schema.sql exists to catch):
--
-- 1. `contact_tags` was never added to the supabase_realtime
--    publication. The inbox's use-realtime hook subscribes to
--    postgres_changes on contact_tags (tag badges on the
--    conversation list + contact sidebar), but a publication that
--    doesn't include the table never emits events, so labels
--    appear to update in place only when some other event forces
--    a re-fetch. Every other subscribed table (messages,
--    conversations, message_reactions, flow_runs, member_presence,
--    notifications) got an explicit ADD TABLE; contact_tags was
--    the lone miss.
--
-- 2. `record_webhook_failure(endpoint_id uuid, max_failures int)`
--    (028) is SECURITY DEFINER but was never GRANTed EXECUTE to
--    service_role — the exact defect 031 fixed for
--    claim_ai_reply_slot (issue #345). The public-webhook
--    deliverer calls it via the service-role client; on hardened /
--    self-hosted Postgres where PUBLIC execute is revoked, every
--    delivery failure silently fails to record and the
--    auto-disable threshold never triggers.
--
-- 3. `touch_presence(TEXT)` (024) is SECURITY DEFINER but was
--    never GRANTed EXECUTE to authenticated. The browser client
--    heartbeats via supabase.rpc('touch_presence'); on the same
--    hardened instances the call returns permission-denied and
--    member presence goes permanently stale (everyone "offline").
--    This is the one client-called RPC in the repo that was
--    missing its grant.
--
-- All three statements are idempotent.
-- ============================================================

-- 1. Publish contact_tags so the inbox's realtime tag badges work.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contact_tags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;
  END IF;
END $$;

-- 2. Let the service role record webhook delivery failures.
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, int) TO service_role;

-- 3. Let signed-in members heartbeat their presence.
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT) TO authenticated;