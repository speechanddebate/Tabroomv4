import { createHash } from 'node:crypto';
import https from 'node:https';
import { convert } from 'html-to-text';
import webPush from 'web-push';
import config from "../../../config.js";
import { db } from "../../../data/database.js";
import logger from '../../../helpers/logger.js';
import sessionRepo from '../../../repos/sessionRepo.js';

/**
 * Push service hosts a subscription endpoint may point at. A leading `*.`
 * matches any subdomain; other entries must match exactly. The send job POSTs
 * to whatever endpoint is stored, so anything else is refused.
 */
export const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'updates.push.services.mozilla.com',
	'*.push.apple.com',
	'*.notify.windows.com',
] as const;

let vapid: { publicKey: string; fingerprint: string } | null = null;

/** Sets the VAPID keys web-push signs with. Leaves push unconfigured when the keys are missing or malformed */
export function initWebPush(): void {
	vapid = null;
	const { subject, publicKey, privateKey } = config.webpush;

	if (!subject || !publicKey || !privateKey) {
		logger.warn('Web push keys not present, web push will not work', { 'event.name': 'notification.push.unconfigured' });
		return;
	}

	try {
		webPush.setVapidDetails(subject, publicKey, privateKey);
	} catch (err) {
		logger.warn('Web push keys are invalid, web push will not work', {
			'event.name': 'notification.push.keys_invalid',
			error: err,
		});
		return;
	}

	vapid = { publicKey, fingerprint: fingerprintKey(publicKey) };
}

export function isPushConfigured(): boolean {
	return vapid !== null;
}

/** The VAPID public key browsers subscribe with, and a short fingerprint of it, or null when push is unconfigured */
export function getVapid(): { publicKey: string; fingerprint: string } | null {
	return vapid;
}

/** First 8 bytes of the SHA-256 of the key, as 16 lowercase hex characters */
function fingerprintKey(publicKey: string): string {
	return createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}

/** Whether a push subscription endpoint points at an allowed push service over plain https */
export function checkPushHost(url: URL): boolean {
	if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return PUSH_HOSTS.some(allowed => allowed.startsWith('*.')
		? host.endsWith(allowed.slice(1))
		: host === allowed);
}

/** What the service worker shows. Matches readPayload() in schemats/src/service-worker.ts */
export type PushPayload = {
	title: string;
	body: string;
	/** Opened on click, relative to the site origin or absolute */
	url?: string;
	/** Notifications with the same tag replace each other in the browser */
	tag?: string;
};

export type PushSubscription = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};

export type PushSendOptions = {
	/** Seconds the push service holds an undelivered message. Default 4 hours */
	ttl?: number;
	urgency?: 'very-low' | 'low' | 'normal' | 'high';
};

export type PushSendResult =
	| { status: 'sent' }
	/** The subscription is dead; the caller should remove it */
	| { status: 'gone' }
	/** The push service refused the request and a retry won't help */
	| { status: 'rejected'; reason: string }
	/** Try again later, after retryAfter seconds when the service said so */
	| { status: 'retry'; reason: string; retryAfter?: number };

/** Longest body sent. The encrypted payload has to fit the push service's 4 KB limit */
export const MAX_PUSH_BODY = 1000;
const DEFAULT_TTL = 4 * 60 * 60;
/** Milliseconds before a silent push service gives the worker slot back */
const SEND_TIMEOUT = 10_000;
/** Longest error body kept in a log line */
const MAX_LOGGED_BODY = 200;
/** Seconds to wait on a 429 that gives no Retry-After. FCM documents a minute as its default */
const RATE_LIMIT_WAIT = 60;

/**
 * Sends one push message to one subscription. Reports what happened instead of
 * throwing, so the caller decides what a dead or busy subscription means.
 */
export async function sendPush(
	subscription: PushSubscription,
	payload: PushPayload,
	options: PushSendOptions = {},
): Promise<PushSendResult> {
	// The endpoint is a bearer URL, so log lines carry only its host
	const host = endpointHost(subscription.endpoint);

	if (!isPushConfigured()) {
		return { status: 'rejected', reason: 'web push is not configured' };
	}

	const json = JSON.stringify({ ...payload, body: clipBody(payload.body) });

	try {
		await webPush.sendNotification(subscription, json, {
			TTL: options.ttl ?? DEFAULT_TTL,
			timeout: SEND_TIMEOUT,
			...(options.urgency ? { urgency: options.urgency } : {}),
			...(payload.tag ? { topic: topicFor(payload.tag) } : {}),
			agent: pushAgent(),
		});
	} catch (err) {
		return sendFailure(err, host);
	}

	logger.debug(`Push sent to ${host}`);
	return { status: 'sent' };
}

const agents = new Map<boolean, https.Agent>();

/**
 * One keep-alive agent for every send, so consecutive pushes to the same service reuse
 * a connection instead of each paying for a TLS handshake. Accepts any certificate when
 * allowSelfSigned is set, for the load test's local fake push service
 */
function pushAgent(): https.Agent {
	const allowSelfSigned = config.webpush.allowSelfSigned === true;
	let agent = agents.get(allowSelfSigned);
	if (!agent) {
		agent = new https.Agent({ keepAlive: true, rejectUnauthorized: !allowSelfSigned });
		agents.set(allowSelfSigned, agent);
	}
	return agent;
}

function endpointHost(endpoint: string): string {
	try {
		return new URL(endpoint).hostname;
	} catch {
		return 'invalid endpoint';
	}
}

function clipBody(body: string): string {
	return body.length > MAX_PUSH_BODY ? `${body.slice(0, MAX_PUSH_BODY - 1)}…` : body;
}

/** The tag as a push service topic: at most 32 characters from the base64url set */
function topicFor(tag: string): string {
	return tag.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32);
}

/** Sorts a failed send into gone, retry, or rejected */
function sendFailure(err: unknown, host: string): PushSendResult {
	if (err instanceof webPush.WebPushError) {
		const { statusCode } = err;
		const body = (err.body ?? '').slice(0, MAX_LOGGED_BODY);

		if (statusCode === 404 || statusCode === 410) {
			logger.debug(`Push subscription on ${host} is gone (${statusCode})`);
			return { status: 'gone' };
		}

		const reason = `push service responded ${statusCode}`;

		// 429 is a rate limit everywhere but WNS, which uses 406 for its throttle
		if (statusCode === 429 || statusCode === 406 || statusCode >= 500) {
			const retryAfter = parseRetryAfter(err.headers?.['retry-after'])
				?? (statusCode === 429 ? RATE_LIMIT_WAIT : undefined);
			logger.warn(`Push to ${host} failed, ${reason}, will retry${retryAfter === undefined ? '' : ` after ${retryAfter}s`}`, {
				'event.name': 'notification.push.retry',
				'error.type': String(statusCode),
			});
			return { status: 'retry', reason, retryAfter };
		}

		if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
			logger.error(`Push to ${host} rejected, ${reason}, check the VAPID keys: ${body}`, {
				'event.name': 'notification.push.vapid_rejected',
				'error.type': String(statusCode),
			});
		} else if (statusCode === 413) {
			logger.error(`Push to ${host} rejected, payload too large: ${body}`, {
				'event.name': 'notification.push.payload_too_large',
				'error.type': '413',
			});
		} else {
			logger.warn(`Push to ${host} rejected, ${reason}: ${body}`, {
				'event.name': 'notification.push.rejected',
				'error.type': String(statusCode),
			});
		}
		return { status: 'rejected', reason };
	}

	// Node network errors carry a code (ECONNRESET, ENOTFOUND...); web-push's own timeout doesn't
	const code = (err as NodeJS.ErrnoException)?.code;
	const message = err instanceof Error ? err.message : String(err);
	if (code || message === 'Socket timeout') {
		logger.warn(`Push to ${host} failed, ${message}, will retry`, {
			'event.name': 'notification.push.retry',
			'error.type': code ?? 'timeout',
		});
		return { status: 'retry', reason: message };
	}

	// What's left is web-push refusing the arguments: malformed keys or options
	logger.error(`Push to ${host} rejected, ${message}`, {
		'event.name': 'notification.push.rejected',
		'error.type': '_OTHER',
		error: err,
	});
	return { status: 'rejected', reason: message };
}

export type PushMessageResult = {
	/** Subscriptions that got the message, by session id */
	sent: number[];
	/** Dead subscriptions that were removed */
	gone: number;
	/** Subscriptions the push service refused */
	rejected: number;
	/** Sessions to try again, with the longest Retry-After the service asked for */
	retry: { sessions: number[]; retryAfter?: number };
	/** Why nothing was attempted, when nothing was */
	skipped?: 'unconfigured' | 'no message' | 'already delivered' | 'deleted' | 'no subscriptions';
};

/** Narrows one message's push to some of its person's logins and sets how the push service handles it */
export type PushMessageOptions = PushSendOptions & {
	/** Only these logins, when set */
	sessions?: number[];
};

const DEFAULT_TITLE = 'Message from Tabroom.com';
const DEFAULT_URL = '/user/home';

/**
 * Pushes one message to each of its person's subscribed logins and removes the dead
 * ones. Reports per-subscription outcomes instead of throwing, so the caller decides
 * whether a retry is worth it; only the unexpected (the database is down) throws.
 */
export async function pushMessage(
	messageId: number,
	/** Sessions not to send to, such as ones an earlier attempt already reached */
	skip: number[] = [],
	options: PushMessageOptions = {},
): Promise<PushMessageResult> {
	const result: PushMessageResult = { sent: [], gone: 0, rejected: 0, retry: { sessions: [] } };

	const vapid = getVapid();
	if (!vapid) {
		return { ...result, skipped: 'unconfigured' };
	}

	// A blast's message carries no body of its own; the content is on its email row
	const message = await db.selectFrom('message')
		.leftJoin('email', 'email.id', 'message.email')
		.select(['message.id', 'message.person', 'message.subject', 'message.body', 'message.url', 'message.deleted_at', 'message.push_status', 'email.content'])
		.where('message.id', '=', messageId)
		.executeTakeFirst();

	// A message deleted between queueing and sending is the recheck working, not an error
	if (!message || !message.person) {
		logger.debug(`Push for message ${messageId} skipped, no message`);
		return { ...result, skipped: 'no message' };
	}
	// A job run again after its push settled sends nothing; null is a job queued before
	// delivery was recorded. Retries of a job still in progress stay queued and go through
	if (message.push_status && message.push_status !== 'queued') {
		logger.debug(`Push for message ${messageId} skipped, already ${message.push_status}`);
		return { ...result, skipped: 'already delivered' };
	}
	if (message.deleted_at) {
		logger.debug(`Push for message ${messageId} skipped, deleted`);
		return { ...result, skipped: 'deleted' };
	}

	const subscriptions = (await sessionRepo.getPushSubscriptions(db, message.person, vapid.fingerprint))
		.filter(session => !skip.includes(session.id) && (!options.sessions || options.sessions.includes(session.id)));
	if (subscriptions.length === 0) {
		logger.debug(`Push for message ${messageId} skipped, person ${message.person} has no subscriptions`);
		return { ...result, skipped: 'no subscriptions' };
	}

	const payload: PushPayload = {
		title: message.subject || DEFAULT_TITLE,
		body: plainText(message.body ?? message.content ?? ''),
		url: message.url || DEFAULT_URL,
		// A retried send replaces the notification on screen instead of adding a second one
		tag: `message:${message.id}`,
	};

	const outcomes = await Promise.all(subscriptions.map(async session => ({
		session,
		outcome: await sendPush({
			endpoint: session.push_endpoint,
			keys: { p256dh: session.push_p256dh, auth: session.push_auth },
		}, payload, { ttl: options.ttl, urgency: options.urgency }),
	})));

	for (const { session, outcome } of outcomes) {
		switch (outcome.status) {
			case 'sent':
				result.sent.push(session.id);
				break;
			case 'gone':
				await sessionRepo.clearPushEndpoint(db, session.id, session.push_endpoint);
				result.gone += 1;
				break;
			case 'rejected':
				result.rejected += 1;
				break;
			case 'retry':
				result.retry.sessions.push(session.id);
				if (outcome.retryAfter !== undefined) {
					result.retry.retryAfter = Math.max(result.retry.retryAfter ?? 0, outcome.retryAfter);
				}
				break;
		}
	}

	return result;
}

/** The inbox body (html or text) as one line of plain text for the notification */
function plainText(body: string): string {
	return convert(body, {
		wordwrap: false,
		selectors: [
			{ selector: 'a', options: { ignoreHref: true } },
			{ selector: 'img', format: 'skip' },
		],
	}).replace(/\s+/g, ' ').trim();
}

/** Seconds to wait from a Retry-After header, given as seconds or an HTTP date */
function parseRetryAfter(value: string | undefined): number | undefined {
	if (!value) return undefined;

	if (/^\d+$/.test(value.trim())) {
		return Number(value);
	}

	const date = Date.parse(value);
	if (Number.isNaN(date)) return undefined;

	return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
