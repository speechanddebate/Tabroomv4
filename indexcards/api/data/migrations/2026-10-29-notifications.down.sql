-- Reverts 2026-10-29-notifications.sql: drops the message delivery columns, then
-- the session push unique key and columns.
--
-- The up migration requires ROW_FORMAT=DYNAMIC on session (COMPACT caps index
-- prefixes at 767 bytes); check SHOW TABLE STATUS LIKE 'session' before
-- re-running it on production.

ALTER TABLE message
	DROP COLUMN email_status,
	DROP COLUMN emailed_at,
	DROP COLUMN push_status,
	DROP COLUMN pushed_at;

ALTER TABLE session
	DROP KEY uk_session_push_endpoint;

ALTER TABLE session
	DROP COLUMN push_endpoint,
	DROP COLUMN push_p256dh,
	DROP COLUMN push_auth,
	DROP COLUMN push_vapid_key,
	DROP COLUMN push_disabled;
