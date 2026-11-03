import request from 'supertest';
import crypto from 'node:crypto';
import webPush from 'web-push';
import server from '../../../../../../app.js';
import factories from '../../../../../../tests/factories/index.js';
import config from '../../../../../config.js';
import logger from '../../../../../helpers/logger.js';
import { db } from '../../../../../data/database.js';
import { getVapid, initWebPush } from '../../../../../services/notifications/channels/webpush.js';
import { PushStatusSchema } from '@tabroom/types';

const vapidKeys = webPush.generateVAPIDKeys();
const originalWebpush = config.webpush;

function configurePush() {
	config.webpush = { subject: 'mailto:test@tabroom.com', publicKey: vapidKeys.publicKey, privateKey: vapidKeys.privateKey };
	initWebPush();
}

function unconfigurePush() {
	config.webpush = {};
	const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	initWebPush();
	warn.mockRestore();
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

function makeSubscription(host = 'fcm.googleapis.com') {
	return {
		endpoint: `https://${host}/fcm/send/${crypto.randomUUID()}`,
		expirationTime: null,
		keys: {
			p256dh: base64url(Buffer.concat([Buffer.from([0x04]), crypto.randomBytes(64)])),
			auth: base64url(crypto.randomBytes(16)),
		},
	};
}

const pushRow = (id: number) => db.selectFrom('session')
	.select(['id', 'person', 'push_endpoint', 'push_p256dh', 'push_auth', 'push_vapid_key', 'push_disabled'])
	.where('id', '=', id)
	.executeTakeFirstOrThrow();

const holders = (endpoint: string) => db.selectFrom('session')
	.select(['id'])
	.where('push_endpoint', '=', endpoint)
	.execute();

const fingerprint = () => getVapid()!.fingerprint;

describe('Push Router', () => {
	const personIds: number[] = [];

	async function newPerson() {
		const Person = await factories.person.create();
		personIds.push(Person.id);
		return Person.id;
	}

	async function newSession(person: number, su?: number) {
		return await factories.session.create({ person, ...(su ? { su } : {}) });
	}

	let personId: number;
	let adminId: number;

	beforeAll(async () => {
		personId = await newPerson();
		adminId = await newPerson();
	});

	beforeEach(() => {
		configurePush();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		config.webpush = originalWebpush;
		initWebPush();
		await db.deleteFrom('session').where('person', 'in', personIds).execute();
		await db.deleteFrom('person').where('id', 'in', personIds).execute();
	});

	describe('auth and CSRF', () => {
		it('returns 401 without a cookie', async () => {
			const res = await request(server).get('/v1/user/notify/push').expect(401);
			expect(res).toBeProblemResponse(401);
		});

		it('returns 403 on PUT without a trusted Origin', async () => {
			const { id, userkey } = await newSession(personId);
			const res = await request(server)
				.put('/v1/user/notify/push')
				.set('Cookie', [`${config.cookie.name}=${userkey}`])
				.send({ subscription: makeSubscription() })
				.expect(403);
			expect(res).toBeProblemResponse(403);
			expect((await pushRow(id)).push_endpoint).toBeNull();
		});

		it('returns 403 on every change while su\'d', async () => {
			const { id, userkey } = await newSession(personId, adminId);
			const other = await newSession(personId);

			const put = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: makeSubscription() }).expect(403);
			expect(put).toBeProblemResponse(403);

			const del = await request(server).delete('/v1/user/notify/push').asPerson(userkey).expect(403);
			expect(del).toBeProblemResponse(403);

			const delOther = await request(server).delete(`/v1/user/notify/push/sessions/${other.id}`).asPerson(userkey).expect(403);
			expect(delOther).toBeProblemResponse(403);

			expect(await pushRow(id)).toMatchObject({ push_endpoint: null, push_disabled: 0 });
			expect(await pushRow(other.id)).toMatchObject({ push_disabled: 0 });
		});

		it('allows GET while su\'d', async () => {
			const { userkey } = await newSession(personId, adminId);
			const res = await request(server).get('/v1/user/notify/push').asPerson(userkey).expect(200);
			expect(res.body).toMatchSchema(PushStatusSchema);
		});
	});

	describe('GET /user/notify/push', () => {
		it('returns the public key and a null endpoint for a new session', async () => {
			const { userkey } = await newSession(personId);
			const res = await request(server).get('/v1/user/notify/push').asPerson(userkey).expect(200);
			expect(res).not.toBeProblemResponse();
			expect(res.body).toMatchSchema(PushStatusSchema);
			expect(res.body).toEqual({ publicKey: vapidKeys.publicKey, endpoint: null, disabled: false });
		});

		it('reflects disabled', async () => {
			const { id, userkey } = await newSession(personId);
			await db.updateTable('session').set({ push_disabled: 1 }).where('id', '=', id).execute();
			const res = await request(server).get('/v1/user/notify/push').asPerson(userkey).expect(200);
			expect(res.body.disabled).toBe(true);
		});

		it('returns a null endpoint when the row was saved under another key', async () => {
			const { id, userkey } = await newSession(personId);
			const sub = makeSubscription();
			await db.updateTable('session').set({
				push_endpoint: sub.endpoint,
				push_p256dh: sub.keys.p256dh,
				push_auth: sub.keys.auth,
				push_vapid_key: '0123456789abcdef',
			}).where('id', '=', id).execute();

			const res = await request(server).get('/v1/user/notify/push').asPerson(userkey).expect(200);
			expect(res.body.endpoint).toBeNull();
		});

		it('returns 503 when push is not configured', async () => {
			unconfigurePush();
			const { userkey } = await newSession(personId);
			const res = await request(server).get('/v1/user/notify/push').asPerson(userkey).expect(503);
			expect(res).toBeProblemResponse(503);
		});
	});

	describe('unconfigured', () => {
		it('returns 503 on PUT', async () => {
			unconfigurePush();
			const { id, userkey } = await newSession(personId);
			const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: makeSubscription() }).expect(503);
			expect(res).toBeProblemResponse(503);
			expect((await pushRow(id)).push_endpoint).toBeNull();
		});

		it('still returns 204 on DELETE', async () => {
			unconfigurePush();
			const { id, userkey } = await newSession(personId);
			await request(server).delete('/v1/user/notify/push').asPerson(userkey).expect(204);
			expect((await pushRow(id)).push_disabled).toBe(1);
		});
	});

	describe('PUT /user/notify/push', () => {
		it('stores the subscription and the current fingerprint', async () => {
			const { id, userkey } = await newSession(personId);
			const sub = makeSubscription();

			const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: sub }).expect(200);

			expect(res).not.toBeProblemResponse();
			expect(res.body).toMatchSchema(PushStatusSchema);
			expect(res.body).toEqual({ publicKey: vapidKeys.publicKey, endpoint: sub.endpoint, disabled: false });
			expect(await pushRow(id)).toMatchObject({
				push_endpoint: sub.endpoint,
				push_p256dh: sub.keys.p256dh,
				push_auth: sub.keys.auth,
				push_vapid_key: fingerprint(),
				push_disabled: 0,
			});
		});

		it('is idempotent for the same endpoint', async () => {
			const { id, userkey } = await newSession(personId);
			const sub = makeSubscription();

			await request(server).put('/v1/user/notify/push').asPerson(userkey).send({ subscription: sub }).expect(200);
			const first = await pushRow(id);
			const res = await request(server).put('/v1/user/notify/push').asPerson(userkey).send({ subscription: sub }).expect(200);

			expect(res.body.endpoint).toBe(sub.endpoint);
			expect(await pushRow(id)).toEqual(first);
			expect(await holders(sub.endpoint)).toEqual([{ id }]);
		});

		it('moves the endpoint over from another of this person\'s sessions', async () => {
			const old = await newSession(personId);
			const current = await newSession(personId);
			const sub = makeSubscription();

			await request(server).put('/v1/user/notify/push').asPerson(old.userkey).send({ subscription: sub }).expect(200);
			await request(server).put('/v1/user/notify/push').asPerson(current.userkey).send({ subscription: sub }).expect(200);

			expect(await holders(sub.endpoint)).toEqual([{ id: current.id }]);
			expect(await pushRow(old.id)).toMatchObject({ push_endpoint: null, push_p256dh: null, push_auth: null, push_vapid_key: null });
		});

		it('moves the endpoint over from another person\'s session, clears the old row and logs it', async () => {
			const otherPerson = await newPerson();
			const old = await newSession(otherPerson);
			const current = await newSession(personId);
			const sub = makeSubscription();

			await request(server).put('/v1/user/notify/push').asPerson(old.userkey).send({ subscription: sub }).expect(200);
			const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
			await request(server).put('/v1/user/notify/push').asPerson(current.userkey).send({ subscription: sub }).expect(200);

			expect(await holders(sub.endpoint)).toEqual([{ id: current.id }]);
			expect(await pushRow(old.id)).toMatchObject({ push_endpoint: null, push_p256dh: null, push_auth: null, push_vapid_key: null });

			expect(warn).toHaveBeenCalledTimes(1);
			const message = String(warn.mock.calls[0]?.[0]);
			expect(message).toContain('fcm.googleapis.com');
			expect(message).toContain(String(otherPerson));
			expect(message).toContain(String(personId));
			expect(message).not.toContain(sub.endpoint);
			expect(message).not.toContain(sub.keys.p256dh);
		});

		it('clears replaces only on this person\'s sessions', async () => {
			const otherPerson = await newPerson();
			const mine = await newSession(personId);
			const theirs = await newSession(otherPerson);
			const current = await newSession(personId);
			const mySub = makeSubscription();
			const theirSub = makeSubscription();

			await request(server).put('/v1/user/notify/push').asPerson(mine.userkey).send({ subscription: mySub }).expect(200);
			await request(server).put('/v1/user/notify/push').asPerson(theirs.userkey).send({ subscription: theirSub }).expect(200);

			const replacement = makeSubscription();
			await request(server).put('/v1/user/notify/push').asPerson(current.userkey)
				.send({ subscription: replacement, replaces: mySub.endpoint }).expect(200);
			expect((await pushRow(mine.id)).push_endpoint).toBeNull();

			await request(server).put('/v1/user/notify/push').asPerson(current.userkey)
				.send({ subscription: makeSubscription(), replaces: theirSub.endpoint }).expect(200);
			expect((await pushRow(theirs.id)).push_endpoint).toBe(theirSub.endpoint);
		});

		it('returns 409 when disabled without enable, and succeeds and clears the flag with enable', async () => {
			const { id, userkey } = await newSession(personId);
			await db.updateTable('session').set({ push_disabled: 1 }).where('id', '=', id).execute();
			const sub = makeSubscription();

			const conflict = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: sub }).expect(409);
			expect(conflict).toBeProblemResponse(409);
			expect(await pushRow(id)).toMatchObject({ push_endpoint: null, push_disabled: 1 });

			const falseEnable = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: sub, enable: false }).expect(409);
			expect(falseEnable).toBeProblemResponse(409);

			const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: sub, enable: true }).expect(200);
			expect(res.body).toEqual({ publicKey: vapidKeys.publicKey, endpoint: sub.endpoint, disabled: false });
			expect(await pushRow(id)).toMatchObject({ push_endpoint: sub.endpoint, push_disabled: 0 });
		});

		it('recovers from a key rotation', async () => {
			const { id, userkey } = await newSession(personId);
			const old = makeSubscription();
			await db.updateTable('session').set({
				push_endpoint: old.endpoint,
				push_p256dh: old.keys.p256dh,
				push_auth: old.keys.auth,
				push_vapid_key: '0123456789abcdef',
			}).where('id', '=', id).execute();

			const status = await request(server).get('/v1/user/notify/push').asPerson(userkey).expect(200);
			expect(status.body.endpoint).toBeNull();

			const sub = makeSubscription();
			const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
				.send({ subscription: sub, replaces: old.endpoint }).expect(200);
			expect(res.body.endpoint).toBe(sub.endpoint);
			expect(await pushRow(id)).toMatchObject({
				push_endpoint: sub.endpoint,
				push_p256dh: sub.keys.p256dh,
				push_vapid_key: fingerprint(),
			});
		});

		describe('rejects a disallowed host and logs it', () => {
			it.each([
				['a non-allowlisted host', 'https://example.com/send/abc'],
				['a lookalike host', 'https://fcm.googleapis.com.evil.com/send/abc'],
				['an internal IP', 'https://10.19.25.1/send/abc'],
				['an explicit port', 'https://fcm.googleapis.com:8443/send/abc'],
			])('%s', async (_label, endpoint) => {
				const { id, userkey } = await newSession(personId);
				const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

				const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
					.send({ subscription: { ...makeSubscription(), endpoint } }).expect(400);

				expect(res).toBeProblemResponse(400);
				expect(warn).toHaveBeenCalledTimes(1);
				const message = String(warn.mock.calls[0]?.[0]);
				expect(message).toContain(new URL(endpoint).hostname);
				expect(message).toContain(String(personId));
				expect((await pushRow(id)).push_endpoint).toBeNull();
			});
		});

		describe('rejects a bad subscription', () => {
			const valid = makeSubscription();
			const notUncompressed = base64url(Buffer.concat([Buffer.from([0x03]), crypto.randomBytes(64)]));

			it.each([
				['an http endpoint', { ...valid, endpoint: 'http://fcm.googleapis.com/fcm/send/abc' }],
				['a non-ASCII endpoint', { ...valid, endpoint: 'https://fcm.googleapis.com/fcm/send/é' }],
				['an endpoint with a space', { ...valid, endpoint: 'https://fcm.googleapis.com/fcm/send/a b' }],
				['an over-long endpoint', { ...valid, endpoint: `https://fcm.googleapis.com/fcm/send/${'a'.repeat(1024)}` }],
				['a padded p256dh', { ...valid, keys: { ...valid.keys, p256dh: `${valid.keys.p256dh}=` } }],
				['a padded auth', { ...valid, keys: { ...valid.keys, auth: `${valid.keys.auth}==` } }],
				['a standard base64 p256dh', { ...valid, keys: { ...valid.keys, p256dh: `+/${valid.keys.p256dh.slice(2)}` } }],
				['a short p256dh', { ...valid, keys: { ...valid.keys, p256dh: valid.keys.p256dh.slice(1) } }],
				['a long auth', { ...valid, keys: { ...valid.keys, auth: `${valid.keys.auth}A` } }],
				['a p256dh not starting with 0x04', { ...valid, keys: { ...valid.keys, p256dh: notUncompressed } }],
				['an unknown field', { ...valid, extra: true }],
				['missing keys', { endpoint: valid.endpoint }],
			])('%s', async (_label, subscription) => {
				const { id, userkey } = await newSession(personId);
				const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
					.send({ subscription }).expect(400);
				expect(res).toBeProblemResponse(400);
				expect((await pushRow(id)).push_endpoint).toBeNull();
			});

			it('a non-https replaces', async () => {
				const { userkey } = await newSession(personId);
				const res = await request(server).put('/v1/user/notify/push').asPerson(userkey)
					.send({ subscription: makeSubscription(), replaces: 'http://fcm.googleapis.com/fcm/send/abc' }).expect(400);
				expect(res).toBeProblemResponse(400);
			});
		});

		describe('concurrency', () => {
			// two sessions claiming the same endpoint at the same instant is a login landing between
			// two in-flight syncs; the loser hits the unique index and gets a 500, which is accepted
			it('gives the endpoint to exactly one of two sessions saving it in parallel', async () => {
				const otherPerson = await newPerson();
				const first = await newSession(personId);
				const second = await newSession(otherPerson);
				const sub = makeSubscription();
				vi.spyOn(logger, 'warn').mockImplementation(() => logger);
				vi.spyOn(logger, 'error').mockImplementation(() => logger);

				const responses = await Promise.all([
					request(server).put('/v1/user/notify/push').asPerson(first.userkey).send({ subscription: sub }),
					request(server).put('/v1/user/notify/push').asPerson(second.userkey).send({ subscription: sub }),
				]);

				expect(responses.map(res => res.status)).toContain(200);
				const rows = await holders(sub.endpoint);
				expect(rows).toHaveLength(1);
				expect([first.id, second.id]).toContain(rows[0]?.id);
			});

			it('leaves a consistent row when one session saves in parallel', async () => {
				const { id, userkey } = await newSession(personId);
				const subs = [makeSubscription(), makeSubscription()];

				const responses = await Promise.all(subs.map(subscription =>
					request(server).put('/v1/user/notify/push').asPerson(userkey).send({ subscription })
				));

				expect(responses.map(res => res.status)).toEqual([200, 200]);
				const row = await pushRow(id);
				const saved = subs.find(sub => sub.endpoint === row.push_endpoint);
				expect(saved).toBeDefined();
				expect(row).toMatchObject({
					push_p256dh: saved!.keys.p256dh,
					push_auth: saved!.keys.auth,
					push_vapid_key: fingerprint(),
				});
			});
		});
	});

	describe('DELETE /user/notify/push', () => {
		it('clears the subscription and turns push off, idempotently', async () => {
			const { id, userkey } = await newSession(personId);
			await request(server).put('/v1/user/notify/push').asPerson(userkey).send({ subscription: makeSubscription() }).expect(200);

			await request(server).delete('/v1/user/notify/push').asPerson(userkey).expect(204);
			const cleared = { push_endpoint: null, push_p256dh: null, push_auth: null, push_vapid_key: null, push_disabled: 1 };
			expect(await pushRow(id)).toMatchObject(cleared);

			await request(server).delete('/v1/user/notify/push').asPerson(userkey).expect(204);
			expect(await pushRow(id)).toMatchObject(cleared);
		});
	});

	describe('DELETE /user/notify/push/sessions/:session', () => {
		it('clears and turns off another of your sessions', async () => {
			const other = await newSession(personId);
			const current = await newSession(personId);
			await request(server).put('/v1/user/notify/push').asPerson(other.userkey).send({ subscription: makeSubscription() }).expect(200);

			await request(server).delete(`/v1/user/notify/push/sessions/${other.id}`).asPerson(current.userkey).expect(204);
			expect(await pushRow(other.id)).toMatchObject({
				push_endpoint: null, push_p256dh: null, push_auth: null, push_vapid_key: null, push_disabled: 1,
			});
		});

		it('returns 404 and changes nothing for another person\'s session', async () => {
			const otherPerson = await newPerson();
			const theirs = await newSession(otherPerson);
			const current = await newSession(personId);
			const sub = makeSubscription();
			await request(server).put('/v1/user/notify/push').asPerson(theirs.userkey).send({ subscription: sub }).expect(200);
			const before = await pushRow(theirs.id);

			const res = await request(server).delete(`/v1/user/notify/push/sessions/${theirs.id}`).asPerson(current.userkey).expect(404);
			expect(res).toBeProblemResponse(404);
			expect(await pushRow(theirs.id)).toEqual(before);
		});

		it('returns 404 for a session that does not exist', async () => {
			const current = await newSession(personId);
			const gone = await newSession(personId);
			await db.deleteFrom('session').where('id', '=', gone.id).execute();

			const res = await request(server).delete(`/v1/user/notify/push/sessions/${gone.id}`).asPerson(current.userkey).expect(404);
			expect(res).toBeProblemResponse(404);
		});

		it('returns 403 while su\'d', async () => {
			const other = await newSession(personId);
			const su = await newSession(personId, adminId);
			const res = await request(server).delete(`/v1/user/notify/push/sessions/${other.id}`).asPerson(su.userkey).expect(403);
			expect(res).toBeProblemResponse(403);
			expect((await pushRow(other.id)).push_disabled).toBe(0);
		});
	});

	describe('POST /user/notify/push/test', () => {
		const TEST_PATH = '/v1/user/notify/push/test';

		/** A session subscribed through PUT, so its row holds the current key */
		async function subscribedSession() {
			const session = await newSession(personId);
			const sub = makeSubscription();
			await request(server).put('/v1/user/notify/push').asPerson(session.userkey).send({ subscription: sub }).expect(200);
			return { ...session, sub };
		}

		const pushServiceError = (statusCode: number) =>
			new webPush.WebPushError('Received unexpected response code', statusCode, {}, '', 'https://fcm.googleapis.com/fcm/send/x');

		it('sends a test push to this login\'s subscription', async () => {
			const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });
			const { userkey, sub } = await subscribedSession();

			await request(server).post(TEST_PATH).asPerson(userkey).expect(204);

			expect(send).toHaveBeenCalledTimes(1);
			const [target, payload, options] = send.mock.calls[0];
			expect(target).toEqual({ endpoint: sub.endpoint, keys: sub.keys });
			expect(JSON.parse(payload as string)).toEqual({
				title: 'Test notification',
				body: 'Notifications from Tabroom are working on this browser.',
				url: '/user/profile',
				tag: 'push-test',
			});
			expect(options).toMatchObject({ TTL: 60, urgency: 'high' });
		});

		it('returns 401 without a cookie', async () => {
			const res = await request(server).post(TEST_PATH).expect(401);
			expect(res).toBeProblemResponse(401);
		});

		it('returns 403 without a trusted Origin', async () => {
			const send = vi.spyOn(webPush, 'sendNotification');
			const { userkey } = await subscribedSession();

			const res = await request(server)
				.post(TEST_PATH)
				.set('Cookie', [`${config.cookie.name}=${userkey}`])
				.expect(403);
			expect(res).toBeProblemResponse(403);
			expect(send).not.toHaveBeenCalled();
		});

		it('returns 403 while su\'d', async () => {
			const send = vi.spyOn(webPush, 'sendNotification');
			const { userkey } = await newSession(personId, adminId);

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(403);
			expect(res).toBeProblemResponse(403);
			expect(send).not.toHaveBeenCalled();
		});

		it('returns 503 when push is not configured', async () => {
			const { userkey } = await subscribedSession();
			unconfigurePush();

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(503);
			expect(res).toBeProblemResponse(503);
		});

		it('returns 409 when this login has no subscription', async () => {
			const send = vi.spyOn(webPush, 'sendNotification');
			const { userkey } = await newSession(personId);

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(409);
			expect(res).toBeProblemResponse(409);
			expect(send).not.toHaveBeenCalled();
		});

		it('returns 409 when push is turned off for this login', async () => {
			const send = vi.spyOn(webPush, 'sendNotification');
			const { userkey } = await subscribedSession();
			await request(server).delete('/v1/user/notify/push').asPerson(userkey).expect(204);

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(409);
			expect(res).toBeProblemResponse(409);
			expect(send).not.toHaveBeenCalled();
		});

		it('returns 409 when the subscription was saved under another key', async () => {
			const send = vi.spyOn(webPush, 'sendNotification');
			const { id, userkey } = await subscribedSession();
			await db.updateTable('session').set({ push_vapid_key: 'fedcba9876543210' }).where('id', '=', id).execute();

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(409);
			expect(res).toBeProblemResponse(409);
			expect(send).not.toHaveBeenCalled();
		});

		it('clears a gone subscription and returns 409', async () => {
			vi.spyOn(webPush, 'sendNotification').mockRejectedValue(pushServiceError(410));
			const { id, userkey } = await subscribedSession();

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(409);
			expect(res).toBeProblemResponse(409);
			expect(await pushRow(id)).toMatchObject({ push_endpoint: null, push_disabled: 0 });
		});

		it('returns 503 and keeps the subscription when the push service fails', async () => {
			vi.spyOn(logger, 'warn').mockImplementation(() => logger);
			vi.spyOn(webPush, 'sendNotification').mockRejectedValue(pushServiceError(500));
			const { id, userkey, sub } = await subscribedSession();

			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(503);
			expect(res).toBeProblemResponse(503);
			expect((await pushRow(id)).push_endpoint).toBe(sub.endpoint);
		});

		it('returns 429 after five tests in a minute from one login', async () => {
			vi.spyOn(webPush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });
			const { userkey } = await subscribedSession();
			const other = await subscribedSession();

			for (let i = 0; i < 5; i++) {
				await request(server).post(TEST_PATH).asPerson(userkey).expect(204);
			}
			const res = await request(server).post(TEST_PATH).asPerson(userkey).expect(429);
			expect(res).toBeProblemResponse(429);

			// The limit is per login
			await request(server).post(TEST_PATH).asPerson(other.userkey).expect(204);
		});
	});
});
