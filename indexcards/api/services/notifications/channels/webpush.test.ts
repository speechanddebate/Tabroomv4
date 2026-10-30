import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import webPush from 'web-push';
import factories from '../../../../tests/factories/index.js';
import config from '../../../config.js';
import { db } from '../../../data/database.js';
import logger from '../../../helpers/logger.js';
import { MAX_PUSH_BODY, checkPushHost, getVapid, initWebPush, isPushConfigured, pushMessage, sendPush } from './webpush.js';

// web-push is CommonJS, so only the default import exists. Everything but the send stays real
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', async (importOriginal) => {
	const actual = await importOriginal<{ default: typeof import('web-push') }>();
	return { default: { ...actual.default, sendNotification } };
});

describe('checkPushHost', () => {
	it.each([
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://web.push.apple.com/abc',
		'https://wns2-by3p.notify.windows.com/w/?token=abc',
	])('accepts %s', (endpoint) => {
		expect(checkPushHost(new URL(endpoint))).toBe(true);
	});

	it.each([
		['a lookalike suffix', 'https://fcm.googleapis.com.evil.com/send'],
		['a lookalike prefix', 'https://evilfcm.googleapis.com/send'],
		['a subdomain of an exact host', 'https://evil.fcm.googleapis.com/send'],
		['the bare wildcard domain', 'https://push.apple.com/abc'],
		['an IP literal', 'https://10.19.25.1/send'],
		['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
		['an explicit port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
		['userinfo', 'https://user:pass@fcm.googleapis.com/fcm/send/abc'],
		['a username only', 'https://user@fcm.googleapis.com/fcm/send/abc'],
		['an unrelated host', 'https://example.com/send'],
	])('rejects %s', (_label, endpoint) => {
		expect(checkPushHost(new URL(endpoint))).toBe(false);
	});
});

describe('initWebPush', () => {
	const original = config.webpush;
	const keys = webPush.generateVAPIDKeys();
	const valid = { subject: 'mailto:test@tabroom.com', publicKey: keys.publicKey, privateKey: keys.privateKey };

	beforeEach(() => {
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	});

	afterEach(() => {
		config.webpush = original;
		vi.restoreAllMocks();
	});

	it('configures push when all keys are present', () => {
		config.webpush = valid;
		initWebPush();

		expect(isPushConfigured()).toBe(true);
		expect(getVapid()?.publicKey).toBe(keys.publicKey);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('gives a stable 16 hex character fingerprint', () => {
		config.webpush = valid;
		initWebPush();
		const first = getVapid()?.fingerprint;
		initWebPush();

		expect(first).toMatch(/^[0-9a-f]{16}$/);
		expect(getVapid()?.fingerprint).toBe(first);
	});

	it.each(['subject', 'publicKey', 'privateKey'] as const)('warns and stays unconfigured without %s', (key) => {
		config.webpush = { ...valid, [key]: undefined };
		initWebPush();

		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith('Web push keys not present, web push will not work');
		expect(isPushConfigured()).toBe(false);
		expect(getVapid()).toBeNull();
	});

	it('warns and stays unconfigured when the keys are malformed', () => {
		config.webpush = { ...valid, publicKey: 'not-a-key', privateKey: 'also-not-a-key' };

		expect(() => initWebPush()).not.toThrow();
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(isPushConfigured()).toBe(false);
		expect(getVapid()).toBeNull();
	});

	it('clears an earlier configuration when re-run without keys', () => {
		config.webpush = valid;
		initWebPush();
		config.webpush = {};
		initWebPush();

		expect(isPushConfigured()).toBe(false);
	});
});

describe('sendPush', () => {
	const original = config.webpush;
	const keys = webPush.generateVAPIDKeys();
	const endpoint = 'https://fcm.googleapis.com/fcm/send/secret-token';
	const subscription = { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } };
	const payload = { title: 'Round 3 posted', body: 'You are in room 12', url: '/user/home', tag: 'message:42' };

	const pushError = (statusCode: number, headers: Record<string, string> = {}, body = '') =>
		new webPush.WebPushError('Received unexpected response code', statusCode, headers, body, endpoint);

	const sentJson = () => JSON.parse(sendNotification.mock.calls[0][1] as string);
	const sentOptions = () => sendNotification.mock.calls[0][2] as Record<string, unknown>;

	beforeEach(() => {
		config.webpush = { subject: 'mailto:test@tabroom.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
		initWebPush();
		sendNotification.mockReset().mockResolvedValue({ statusCode: 201, body: '', headers: {} });
		vi.spyOn(logger, 'debug').mockImplementation(() => logger);
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
		vi.spyOn(logger, 'error').mockImplementation(() => logger);
	});

	afterEach(() => {
		config.webpush = original;
		initWebPush();
		vi.restoreAllMocks();
	});

	it('sends the payload as JSON with the default TTL and a timeout', async () => {
		await expect(sendPush(subscription, payload)).resolves.toEqual({ status: 'sent' });

		expect(sendNotification).toHaveBeenCalledOnce();
		expect(sendNotification.mock.calls[0][0]).toBe(subscription);
		expect(sentJson()).toEqual(payload);
		expect(sentOptions()).toEqual({ TTL: 4 * 60 * 60, timeout: 10_000, topic: 'message-42', agent: expect.any(Object) });
	});

	it('sends through a shared keep-alive agent that checks certificates', async () => {
		await sendPush(subscription, payload);
		await sendPush(subscription, payload);

		const agent = (call: number) => sendNotification.mock.calls[call][2].agent as { options: { keepAlive?: boolean; rejectUnauthorized?: boolean } };
		expect(agent(0).options).toMatchObject({ keepAlive: true, rejectUnauthorized: true });
		expect(agent(1)).toBe(agent(0));
	});

	it('accepts any certificate only when allowSelfSigned is set', async () => {
		config.webpush = { ...config.webpush, allowSelfSigned: true };
		await sendPush(subscription, payload);

		const { agent } = sendNotification.mock.calls[0][2] as { agent: { options: { rejectUnauthorized?: boolean } } };
		expect(agent.options.rejectUnauthorized).toBe(false);
	});

	it('passes ttl and urgency through', async () => {
		await sendPush(subscription, payload, { ttl: 60, urgency: 'high' });

		expect(sentOptions()).toMatchObject({ TTL: 60, urgency: 'high' });
	});

	it('clips the topic to 32 base64url characters', async () => {
		await sendPush(subscription, { ...payload, tag: 'a tag with spaces/and slashes that runs long' });

		expect(sentOptions().topic).toBe('a-tag-with-spaces-and-slashes-th');
	});

	it('sends no topic without a tag', async () => {
		await sendPush(subscription, { title: 'Hi', body: 'there' });

		expect(sentOptions()).not.toHaveProperty('topic');
		expect(sentJson()).toEqual({ title: 'Hi', body: 'there' });
	});

	it('clips a long body', async () => {
		await sendPush(subscription, { ...payload, body: 'x'.repeat(MAX_PUSH_BODY + 500) });

		const { body } = sentJson();
		expect(body).toHaveLength(MAX_PUSH_BODY);
		expect(body.endsWith('…')).toBe(true);
	});

	it('leaves a body at the limit alone', async () => {
		const body = 'x'.repeat(MAX_PUSH_BODY);
		await sendPush(subscription, { ...payload, body });

		expect(sentJson().body).toBe(body);
	});

	it('is rejected without sending when push is not configured', async () => {
		config.webpush = {};
		initWebPush();

		await expect(sendPush(subscription, payload)).resolves.toEqual({
			status: 'rejected',
			reason: 'web push is not configured',
		});
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it.each([404, 410])('reports a %s as gone', async (statusCode) => {
		sendNotification.mockRejectedValue(pushError(statusCode));

		await expect(sendPush(subscription, payload)).resolves.toEqual({ status: 'gone' });
		expect(logger.warn).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});

	it.each([400, 401, 403])('rejects a %s and logs an error about the keys', async (statusCode) => {
		sendNotification.mockRejectedValue(pushError(statusCode, {}, 'the key is wrong'));

		await expect(sendPush(subscription, payload)).resolves.toEqual({
			status: 'rejected',
			reason: `push service responded ${statusCode}`,
		});
		expect(logger.error).toHaveBeenCalledOnce();
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('VAPID'));
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('the key is wrong'));
	});

	it('rejects a 413 and logs an error about the payload', async () => {
		sendNotification.mockRejectedValue(pushError(413));

		await expect(sendPush(subscription, payload)).resolves.toMatchObject({ status: 'rejected' });
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('payload too large'));
	});

	it('rejects any other 4xx with a warning', async () => {
		sendNotification.mockRejectedValue(pushError(418));

		await expect(sendPush(subscription, payload)).resolves.toEqual({
			status: 'rejected',
			reason: 'push service responded 418',
		});
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.error).not.toHaveBeenCalled();
	});

	it.each([406, 500, 502, 503])('asks for a retry on a %s', async (statusCode) => {
		sendNotification.mockRejectedValue(pushError(statusCode));

		await expect(sendPush(subscription, payload)).resolves.toEqual({
			status: 'retry',
			reason: `push service responded ${statusCode}`,
			retryAfter: undefined,
		});
		expect(logger.warn).toHaveBeenCalledOnce();
	});

	it('waits a minute on a 429 that gives no Retry-After', async () => {
		sendNotification.mockRejectedValue(pushError(429));

		await expect(sendPush(subscription, payload)).resolves.toEqual({
			status: 'retry',
			reason: 'push service responded 429',
			retryAfter: 60,
		});
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('after 60s'));
	});

	it('reads Retry-After given in seconds', async () => {
		sendNotification.mockRejectedValue(pushError(429, { 'retry-after': '120' }));

		await expect(sendPush(subscription, payload)).resolves.toMatchObject({ status: 'retry', retryAfter: 120 });
	});

	it('reads Retry-After given as an HTTP date', async () => {
		const date = new Date(Date.now() + 90 * 1000).toUTCString();
		sendNotification.mockRejectedValue(pushError(503, { 'retry-after': date }));

		const result = await sendPush(subscription, payload);
		expect(result).toMatchObject({ status: 'retry' });
		expect((result as { retryAfter?: number }).retryAfter).toBeGreaterThanOrEqual(88);
		expect((result as { retryAfter?: number }).retryAfter).toBeLessThanOrEqual(90);
	});

	it('falls back to the default wait when a 429 Retry-After cannot be read', async () => {
		sendNotification.mockRejectedValue(pushError(429, { 'retry-after': 'soon' }));

		await expect(sendPush(subscription, payload)).resolves.toMatchObject({ status: 'retry', retryAfter: 60 });
	});

	it('ignores a Retry-After it cannot read on a 503', async () => {
		sendNotification.mockRejectedValue(pushError(503, { 'retry-after': 'soon' }));

		await expect(sendPush(subscription, payload)).resolves.toMatchObject({ status: 'retry', retryAfter: undefined });
	});

	it('truncates the error body it logs', async () => {
		sendNotification.mockRejectedValue(pushError(400, {}, 'y'.repeat(1000)));

		await sendPush(subscription, payload);
		const logged = String(vi.mocked(logger.error).mock.calls[0][0]);
		expect(logged.length).toBeLessThan(400);
	});

	it.each([
		['a connection reset', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })],
		['a DNS failure', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })],
		['a socket timeout', new Error('Socket timeout')],
	])('asks for a retry on %s', async (_label, error) => {
		sendNotification.mockRejectedValue(error);

		await expect(sendPush(subscription, payload)).resolves.toEqual({ status: 'retry', reason: error.message });
		expect(logger.warn).toHaveBeenCalledOnce();
	});

	it('rejects when web-push refuses the arguments', async () => {
		sendNotification.mockRejectedValue(new Error('To send a message with a payload, the subscription must have \'auth\' and \'p256dh\' keys.'));

		await expect(sendPush(subscription, payload)).resolves.toMatchObject({ status: 'rejected' });
		expect(logger.error).toHaveBeenCalledOnce();
	});

	it('never logs the endpoint path', async () => {
		const errors = [pushError(400, {}, 'bad'), pushError(429), pushError(410), new Error('Socket timeout'), new Error('bad args')];
		for (const error of errors) {
			sendNotification.mockRejectedValueOnce(error);
			await sendPush(subscription, payload);
		}
		await sendPush(subscription, payload);

		const lines = [logger.debug, logger.warn, logger.error]
			.flatMap(fn => vi.mocked(fn).mock.calls)
			.map(call => String(call[0]));
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			expect(line).not.toContain('secret-token');
			expect(line).toContain('fcm.googleapis.com');
		}
	});
});

describe('pushMessage', () => {
	const original = config.webpush;
	const keys = webPush.generateVAPIDKeys();
	let count = 0;

	const subscription = () => ({
		push_endpoint: `https://fcm.googleapis.com/fcm/send/pm-${process.pid}-${++count}`,
		push_p256dh: 'p256dh',
		push_auth: 'auth',
		push_vapid_key: getVapid()!.fingerprint,
	});
	const pushError = (statusCode: number, endpoint: string, headers: Record<string, string> = {}) =>
		new webPush.WebPushError('Received unexpected response code', statusCode, headers, '', endpoint);
	/** Resolves or rejects per endpoint, so each session can get its own outcome */
	const respondByEndpoint = (outcomes: Record<string, number | Error>) => {
		sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
			const outcome = outcomes[sub.endpoint] ?? 201;
			if (outcome instanceof Error) throw outcome;
			if (outcome >= 400) throw pushError(outcome, sub.endpoint);
			return { statusCode: outcome, body: '', headers: {} };
		});
	};
	const sentTo = () => sendNotification.mock.calls.map(call => (call[0] as { endpoint: string }).endpoint).sort();
	const pushRow = (id: number) => db.selectFrom('session')
		.select(['push_endpoint', 'push_disabled'])
		.where('id', '=', id)
		.executeTakeFirstOrThrow();

	let Person: { id: number };

	beforeAll(async () => {
		Person = await factories.person.create();
	});

	beforeEach(() => {
		config.webpush = { subject: 'mailto:test@tabroom.com', publicKey: keys.publicKey, privateKey: keys.privateKey };
		initWebPush();
		sendNotification.mockReset().mockResolvedValue({ statusCode: 201, body: '', headers: {} });
		vi.spyOn(logger, 'debug').mockImplementation(() => logger);
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
		vi.spyOn(logger, 'error').mockImplementation(() => logger);
	});

	afterEach(() => {
		config.webpush = original;
		initWebPush();
		vi.restoreAllMocks();
	});

	async function newMessage(overrides = {}) {
		return await factories.message.create({ person: Person.id, ...overrides });
	}

	it('sends the message to every subscribed login', async () => {
		const Owner = await factories.person.create();
		const first = await factories.session.create({ person: Owner.id, ...subscription() });
		const second = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id, subject: 'Round 3 posted', body: 'Room 12', url: '/user/judge/ballot/1' });

		const result = await pushMessage(message.id);

		expect(result).toEqual({ sent: expect.arrayContaining([first.id, second.id]), gone: 0, rejected: 0, retry: { sessions: [] } });
		expect(result.sent).toHaveLength(2);
		expect(sentTo()).toEqual([first.push_endpoint, second.push_endpoint].sort());
		expect(sendNotification.mock.calls[0][0]).toEqual({
			endpoint: expect.any(String),
			keys: { p256dh: 'p256dh', auth: 'auth' },
		});
		expect(JSON.parse(sendNotification.mock.calls[0][1] as string)).toEqual({
			title: 'Round 3 posted',
			body: 'Room 12',
			url: '/user/judge/ballot/1',
			tag: `message:${message.id}`,
		});
	});

	it('fills in a title and url and flattens an html body', async () => {
		await factories.session.create({ person: Person.id, ...subscription() });
		const message = await newMessage({
			subject: null,
			url: null,
			body: '<p>Your round is in <a href="https://example.com">room 12</a>.</p>\n<p>Go <b>now</b>.</p><img src="x.png">',
		});

		await pushMessage(message.id);

		expect(JSON.parse(sendNotification.mock.calls[0][1] as string)).toMatchObject({
			title: 'Message from Tabroom.com',
			body: 'Your round is in room 12. Go now.',
			url: '/user/home',
		});
	});

	it('uses the email row content when a blast message has no body of its own', async () => {
		await factories.session.create({ person: Person.id, ...subscription() });
		const email = await factories.email.create({ content: '<p>Pairings for <b>round 3</b> are up.</p>' });
		const message = await newMessage({ body: null, email: email.id });

		await pushMessage(message.id);

		expect(JSON.parse(sendNotification.mock.calls[0][1] as string)).toMatchObject({ body: 'Pairings for round 3 are up.' });
	});

	it('skips a message that does not exist', async () => {
		await expect(pushMessage(999999999)).resolves.toMatchObject({ skipped: 'no message', sent: [] });
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it('skips a deleted message', async () => {
		await factories.session.create({ person: Person.id, ...subscription() });
		const message = await newMessage({ deleted_at: new Date() });

		await expect(pushMessage(message.id)).resolves.toMatchObject({ skipped: 'deleted' });
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it('skips a message whose push already ended, so a rerun job sends nothing', async () => {
		await factories.session.create({ person: Person.id, ...subscription() });
		const message = await newMessage({ push_status: 'sent' });

		await expect(pushMessage(message.id)).resolves.toMatchObject({ skipped: 'already delivered', sent: [] });
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it('sends a message whose push is still queued, as a retry in progress is', async () => {
		const Owner = await factories.person.create();
		const session = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id, push_status: 'queued' });

		await expect(pushMessage(message.id)).resolves.toMatchObject({ sent: [session.id] });
	});

	it('skips a person with no subscriptions', async () => {
		const Loner = await factories.person.create();
		await factories.session.create({ person: Loner.id });
		const message = await newMessage({ person: Loner.id });

		await expect(pushMessage(message.id)).resolves.toMatchObject({ skipped: 'no subscriptions' });
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it('skips when push is not configured', async () => {
		await factories.session.create({ person: Person.id, ...subscription() });
		const message = await newMessage();
		config.webpush = {};
		initWebPush();

		await expect(pushMessage(message.id)).resolves.toMatchObject({ skipped: 'unconfigured' });
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it('does not repeat logins already sent to', async () => {
		const Owner = await factories.person.create();
		const done = await factories.session.create({ person: Owner.id, ...subscription() });
		const waiting = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id });

		const result = await pushMessage(message.id, [done.id]);

		expect(result.sent).toEqual([waiting.id]);
		expect(sentTo()).toEqual([waiting.push_endpoint]);
	});

	it('skips when every login was already sent to', async () => {
		const Owner = await factories.person.create();
		const done = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id });

		await expect(pushMessage(message.id, [done.id])).resolves.toMatchObject({ skipped: 'no subscriptions' });
	});

	it('removes a subscription the push service says is gone', async () => {
		const Owner = await factories.person.create();
		const dead = await factories.session.create({ person: Owner.id, ...subscription() });
		const live = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id });
		respondByEndpoint({ [dead.push_endpoint as string]: 410 });

		const result = await pushMessage(message.id);

		expect(result).toEqual({ sent: [live.id], gone: 1, rejected: 0, retry: { sessions: [] } });
		expect(await pushRow(dead.id)).toEqual({ push_endpoint: null, push_disabled: 0 });
		expect(await pushRow(live.id)).toEqual({ push_endpoint: live.push_endpoint, push_disabled: 0 });
	});

	it('keeps a subscription the browser replaced while the send was in flight', async () => {
		const Owner = await factories.person.create();
		const session = await factories.session.create({ person: Owner.id, ...subscription() });
		const replacement = subscription().push_endpoint;
		const message = await newMessage({ person: Owner.id });
		sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
			await db.updateTable('session').set({ push_endpoint: replacement }).where('id', '=', session.id).execute();
			throw pushError(410, sub.endpoint);
		});

		const result = await pushMessage(message.id);

		expect(result.gone).toBe(1);
		expect((await pushRow(session.id)).push_endpoint).toBe(replacement);
	});

	it('collects the logins to retry and the longest Retry-After', async () => {
		const Owner = await factories.person.create();
		const ok = await factories.session.create({ person: Owner.id, ...subscription() });
		const busy = await factories.session.create({ person: Owner.id, ...subscription() });
		const down = await factories.session.create({ person: Owner.id, ...subscription() });
		const later = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id });
		sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
			if (sub.endpoint === busy.push_endpoint) throw pushError(429, sub.endpoint, { 'retry-after': '30' });
			if (sub.endpoint === down.push_endpoint) throw pushError(503, sub.endpoint);
			if (sub.endpoint === later.push_endpoint) throw pushError(429, sub.endpoint, { 'retry-after': '90' });
			return { statusCode: 201, body: '', headers: {} };
		});

		const result = await pushMessage(message.id);

		expect(result.sent).toEqual([ok.id]);
		expect(result.retry.sessions.sort()).toEqual([busy.id, down.id, later.id].sort());
		expect(result.retry.retryAfter).toBe(90);
	});

	it('counts subscriptions the push service rejected', async () => {
		const Owner = await factories.person.create();
		const bad = await factories.session.create({ person: Owner.id, ...subscription() });
		const message = await newMessage({ person: Owner.id });
		respondByEndpoint({ [bad.push_endpoint as string]: 400 });

		const result = await pushMessage(message.id);

		expect(result).toEqual({ sent: [], gone: 0, rejected: 1, retry: { sessions: [] } });
		expect((await pushRow(bad.id)).push_endpoint).toBe(bad.push_endpoint);
	});
});
