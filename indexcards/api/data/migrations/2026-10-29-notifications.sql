-- Schema for the notifications pipeline: web push subscription columns on
-- session (one subscription per login), and delivery status columns on message.
--
-- session: requires ROW_FORMAT=DYNAMIC (the MariaDB default since 10.2). The unique key
-- covers the full 1,024-byte ascii push_endpoint, and a COMPACT table caps index
-- prefixes at 767 bytes, so the second ALTER would fail. Before running on
-- production, check: SHOW TABLE STATUS LIKE 'session';
--
-- Two statements so the column adds can run as INSTANT and only the index build
-- needs INPLACE. push_notify and push_active stay until the OneSignal cutover.
--
-- message: each channel's status is NULL when the message wasn't sent on that
-- channel, queued until its job settles, then final with its _at time. Nullable
-- columns added at the end, so the add is INSTANT however large message is.

ALTER TABLE session
	ADD COLUMN push_endpoint  varchar(1024) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
	ADD COLUMN push_p256dh    varchar(127)  CHARACTER SET ascii DEFAULT NULL,
	ADD COLUMN push_auth      varchar(31)   CHARACTER SET ascii DEFAULT NULL,
	ADD COLUMN push_vapid_key char(16)      CHARACTER SET ascii DEFAULT NULL,
	ADD COLUMN push_disabled  tinyint(1) NOT NULL DEFAULT 0;

ALTER TABLE session
	ADD UNIQUE KEY uk_session_push_endpoint (push_endpoint),
	ALGORITHM=INPLACE, LOCK=NONE;

ALTER TABLE message
	ADD COLUMN email_status enum('queued','sent','logged','skipped','rejected','failed') DEFAULT NULL,
	ADD COLUMN emailed_at   datetime DEFAULT NULL,
	ADD COLUMN push_status  enum('queued','sent','skipped','rejected','failed') DEFAULT NULL,
	ADD COLUMN pushed_at    datetime DEFAULT NULL,
	ALGORITHM=INSTANT;
