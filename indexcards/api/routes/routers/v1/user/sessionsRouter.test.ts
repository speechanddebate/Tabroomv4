import request from 'supertest';
import crypto from 'node:crypto';
import webPush from 'web-push';
import z from 'zod';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import config from '../../../../config.js';
import logger from '../../../../helpers/logger.js';
import { db } from '../../../../data/database.js';
import { getVapid, initWebPush } from '../../../../services/notifications/channels/webpush.js';
import { SessionSchema, UserSessionSchema } from '@tabroom/types';
import type { UserSession } from '@tabroom/types';

const vapidKeys = webPush.generateVAPIDKeys();
const originalWebpush = config.webpush;

// config.test.json is gitignored, so push is configured in-test
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

/** Writes a push subscription straight onto a session row, stamped with the given key fingerprint */
async function subscribe(sessionId: number, fingerprint: string) {
	const sub = {
		endpoint: `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`,
		p256dh: Buffer.concat([Buffer.from([0x04]), crypto.randomBytes(64)]).toString('base64url'),
		auth: crypto.randomBytes(16).toString('base64url'),
	};
	await db.updateTable('session')
		.set({ push_endpoint: sub.endpoint, push_p256dh: sub.p256dh, push_auth: sub.auth, push_vapid_key: fingerprint })
		.where('id', '=', sessionId)
		.execute();
	return sub;
}

const list = async (userkey: string) => {
	const res = await request(server).get('/v1/user/sessions').asPerson(userkey).expect(200);
	expect(res).not.toBeProblemResponse();
	expect(res.body).toMatchSchema(z.array(UserSessionSchema));
	return res.body as UserSession[];
};

describe('Sessions Router', () => {
	const personIds: number[] = [];
	let adminId: number;

	async function newPerson() {
		const Person = await factories.person.create();
		personIds.push(Person.id);
		return Person.id;
	}

	async function newSession(person: number, su?: number) {
		return await factories.session.create({ person, ...(su ? { su } : {}) });
	}

	beforeAll(async () => {
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

	describe('GET /user/session', () => {
		it('Returns the current user session', async () => {
			const personId = await newPerson();
			await db.updateTable('person').set({ tz: 'America/Chicago' }).where('id', '=', personId).execute();
			const { userkey } = await factories.session.create({ person: personId });

			const res = await request(server)
				.get('/v1/user/session')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res).not.toBeProblemResponse();
			expect(res.body).toMatchSchema(SessionSchema);
			expect(res.body).toHaveProperty('id');
			expect(res.body.Person).toHaveProperty('id', personId);
			expect(res.body.Person).toHaveProperty('tz', 'America/Chicago');
		});
		it('Does not expose the push subscription columns', async () => {
			const { userkey } = await factories.session.create({ person: await newPerson() });
			const res = await request(server)
				.get('/v1/user/session')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);

			expect(Object.keys(res.body).filter((key) => key.startsWith('push_'))).toEqual([]);
		});
		it('Returns 401 if not authenticated', async () => {
			const res = await request(server)
				.get('/v1/user/session')
				.set('Accept', 'application/json')
				.expect(401);
			expect(res).toBeProblemResponse(401);
		});
	});

	describe('GET /user/sessions', () => {
		it('returns 401 without a cookie', async () => {
			const res = await request(server).get('/v1/user/sessions').expect(401);
			expect(res).toBeProblemResponse(401);
		});

		it('lists only this person\'s sessions and marks the current one', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const other = await newSession(owner);
			const stranger = await newSession(await newPerson());

			const sessions = await list(current.userkey);
			const ids = sessions.map(row => row.id);
			expect(ids).toHaveLength(2);
			expect(ids).toEqual(expect.arrayContaining([current.id, other.id]));
			expect(ids).not.toContain(stranger.id);
			expect(sessions.find(row => row.id === current.id)).toMatchObject({ current: true });
			expect(sessions.find(row => row.id === other.id)).toMatchObject({ current: false });
		});

		it('excludes su\'d sessions', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const su = await newSession(owner, adminId);

			const ids = (await list(current.userkey)).map(row => row.id);
			expect(ids).toEqual([current.id]);
			expect(ids).not.toContain(su.id);
		});

		it('is allowed while su\'d and lists the target person\'s own sessions', async () => {
			const owner = await newPerson();
			const own = await newSession(owner);
			const su = await newSession(owner, adminId);

			expect((await list(su.userkey)).map(row => row.id)).toEqual([own.id]);
		});

		it('returns the push host only, never the endpoint or keys', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const other = await newSession(owner);
			const sub = await subscribe(other.id, getVapid()!.fingerprint);

			const res = await request(server).get('/v1/user/sessions').asPerson(current.userkey).expect(200);
			const row = (res.body as UserSession[]).find(session => session.id === other.id);
			expect(row).toMatchObject({ subscribed: true, disabled: false, host: 'fcm.googleapis.com' });

			const body = JSON.stringify(res.body);
			expect(body).not.toContain(sub.endpoint);
			expect(body).not.toContain('/fcm/send/');
			expect(body).not.toContain(sub.p256dh);
			expect(body).not.toContain(sub.auth);
			expect(body).not.toContain('push_');
		});

		it('reports subscribed false and no host under a different key', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			await subscribe(current.id, '0000000000000000');

			expect(await list(current.userkey)).toEqual([
				expect.objectContaining({ id: current.id, current: true, subscribed: false, host: null }),
			]);
		});

		it('reports subscribed false everywhere when push is not configured', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const other = await newSession(owner);
			await subscribe(other.id, getVapid()!.fingerprint);
			unconfigurePush();

			const sessions = await list(current.userkey);
			expect(sessions).toHaveLength(2);
			for (const row of sessions) {
				expect(row).toMatchObject({ subscribed: false, host: null });
			}
		});

		it('reads the browser and OS from classic\'s JSON and from a raw User-Agent', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const classic = await newSession(owner);
			const raw = await newSession(owner);
			await db.updateTable('session').set({ agent_data: '{"browser":"Chrome","os":"Windows 10","brand":""}' }).where('id', '=', classic.id).execute();
			await db.updateTable('session').set({ agent_data: 'Mozilla/5.0 (X11; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0' }).where('id', '=', raw.id).execute();
			await db.updateTable('session').set({ agent_data: null }).where('id', '=', current.id).execute();

			const sessions = await list(current.userkey);
			expect(sessions.find(row => row.id === classic.id)).toMatchObject({ browser: 'Chrome', os: 'Windows 10' });
			expect(sessions.find(row => row.id === raw.id)).toMatchObject({ browser: 'Firefox', os: 'Linux' });
			expect(sessions.find(row => row.id === current.id)).toMatchObject({ browser: null, os: null });
		});

		it('reports disabled logins and serializes dates as ISO strings', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			await db.updateTable('session').set({ push_disabled: 1 }).where('id', '=', current.id).execute();

			const [row] = await list(current.userkey);
			expect(row).toMatchObject({ id: current.id, disabled: true, subscribed: false });
			// the request itself stamps last_access
			expect(row!.last_access).not.toBeNull();
			expect(new Date(row!.last_access!).toISOString()).toBe(row!.last_access);
		});
	});

	describe('DELETE /user/sessions/:sessionId', () => {
		const end = (userkey: string, sessionId: number | string) =>
			request(server).delete(`/v1/user/sessions/${sessionId}`).asPerson(userkey);

		const exists = async (sessionId: number) =>
			Boolean(await db.selectFrom('session').select('id').where('id', '=', sessionId).executeTakeFirst());

		it('returns 401 without a cookie', async () => {
			const res = await request(server).delete('/v1/user/sessions/1').expect(401);
			expect(res).toBeProblemResponse(401);
		});

		it('ends another of the person\'s sessions, and its cookie stops authenticating', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const other = await newSession(owner);

			await end(current.userkey, other.id).expect(204);

			expect(await exists(other.id)).toBe(false);
			expect((await list(current.userkey)).map(row => row.id)).toEqual([current.id]);
			const res = await request(server).get('/v1/user/session').asPerson(other.userkey).expect(401);
			expect(res).toBeProblemResponse(401);
		});

		it('ends push with the session', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const other = await newSession(owner);
			await subscribe(other.id, getVapid()!.fingerprint);

			await end(current.userkey, other.id).expect(204);

			const pushable = await db.selectFrom('session').select('id')
				.where('person', '=', owner)
				.where('push_endpoint', 'is not', null)
				.execute();
			expect(pushable).toEqual([]);
		});

		it('rejects the current session with 400 and keeps it', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);

			const res = await end(current.userkey, current.id).expect(400);
			expect(res).toBeProblemResponse(400);
			expect(await exists(current.id)).toBe(true);
		});

		it('returns 404 for someone else\'s session and keeps it', async () => {
			const current = await newSession(await newPerson());
			const stranger = await newSession(await newPerson());

			const res = await end(current.userkey, stranger.id).expect(404);
			expect(res).toBeProblemResponse(404);
			expect(await exists(stranger.id)).toBe(true);
		});

		it('returns 404 for an admin\'s su session on the person, which the list leaves out', async () => {
			const owner = await newPerson();
			const current = await newSession(owner);
			const su = await newSession(owner, adminId);

			const res = await end(current.userkey, su.id).expect(404);
			expect(res).toBeProblemResponse(404);
			expect(await exists(su.id)).toBe(true);
		});

		it('returns 404 for a session that doesn\'t exist', async () => {
			const current = await newSession(await newPerson());
			const res = await end(current.userkey, 2147483647).expect(404);
			expect(res).toBeProblemResponse(404);
		});

		it('returns 400 for an id that isn\'t a positive integer', async () => {
			const current = await newSession(await newPerson());
			const res = await end(current.userkey, 'abc').expect(400);
			expect(res).toBeProblemResponse(400);
		});

		it('is allowed while su\'d and ends the target person\'s own session', async () => {
			const owner = await newPerson();
			const own = await newSession(owner);
			const su = await newSession(owner, adminId);

			await end(su.userkey, own.id).expect(204);
			expect(await exists(own.id)).toBe(false);
		});
	});
});
