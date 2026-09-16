-- ============================================================
-- 044_quick_reply_media.sql
--
-- Adds media support to quick replies: an agent can now save a
-- media file (image / video / document) as a reusable snippet
-- and pick it from the inbox composer without re-uploading.
--
--   - `media_type` and `media_url` columns on `quick_replies`
--     hold the stored file and its kind.
--   - `kind` CHECK expanded from ('text', 'interactive') to
--     ('text', 'interactive', 'media').
-- ============================================================

ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT;

ALTER TABLE quick_replies
  DROP CONSTRAINT IF EXISTS quick_replies_kind_check;

ALTER TABLE quick_replies
  ADD CONSTRAINT quick_replies_kind_check
    CHECK (kind IN ('text', 'interactive', 'media'));
