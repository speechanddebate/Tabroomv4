-- Reverts 2026-10-29-session-push.sql: drops the unique key, then the columns.
--
-- The up migration requires ROW_FORMAT=DYNAMIC on session (COMPACT caps index
-- prefixes at 767 bytes); check SHOW TABLE STATUS LIKE 'session' before
-- re-running it on production.

ALTER TABLE session
	DROP KEY uk_session_push_endpoint;

ALTER TABLE session
	DROP COLUMN push_endpoint,
	DROP COLUMN push_p256dh,
	DROP COLUMN push_auth,
	DROP COLUMN push_vapid_key,
	DROP COLUMN push_disabled;
