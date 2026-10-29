
import sessionRepo from './sessionRepo.js';
import { db } from '../data/database.js';
import factories from '../../tests/factories/index.js';

const Person = await factories.person.create();

describe('getSession', () => {
	it('returns null when session does not exist', async () => {
		const session = await sessionRepo.getSession(db, 999999);
		expect(session).toBeUndefined();
	});
	it('returns the session when it exists', async () => {
		const { id: sessionId } = await factories.session.create({ person: Person.id });
		const session = await sessionRepo.getSession(db, sessionId);
		expect(session).toBeDefined();
		expect(session?.id).toBe(sessionId);
	});
	it('does not return the push subscription columns', async () => {
		const { id: sessionId } = await factories.session.create({ person: Person.id });
		const session = await sessionRepo.getSession(db, sessionId);
		expect(session).toHaveProperty('push_notify');
		expect(session).not.toHaveProperty('push_endpoint');
		expect(session).not.toHaveProperty('push_p256dh');
		expect(session).not.toHaveProperty('push_auth');
		expect(session).not.toHaveProperty('push_vapid_key');
		expect(session).not.toHaveProperty('push_disabled');
	});
});

describe('findByUserKey', () => {

	it('returns null when session does not exist', async () => {
		const session = await sessionRepo.findByUserKey(db,'nonexistentkey');
		expect(session).toBeUndefined();
	});

	it('returns the session when it exists', async () => {
		const Session = await factories.session.create({person: Person.id});
		const session = await sessionRepo.findByUserKey(db, Session.userkey as string);
		expect(session).toBeDefined();
		expect(session?.id).toBe(Session.id);
		expect(session?.Person?.id).toBe(Session.person);
	});

	it('returns the session with Su when it exists', async () => {
		const Su = await factories.person.create();
		const Session = await factories.session.create({person: Person.id, su: Su.id});
		const session = await sessionRepo.findByUserKey(db, Session.userkey);
		expect(session).toBeDefined();
		expect(session?.id).toBe(Session.id);
		expect(session?.Person?.id).toBe(Session.person);
		expect(session?.Su?.id).toBe(Su.id);
	});
	it('returns the Person and Su timezones', async () => {
		const TzPerson = await factories.person.create({ tz: 'America/Chicago' });
		const Su = await factories.person.create({ tz: 'Europe/London' });
		const Session = await factories.session.create({person: TzPerson.id, su: Su.id});
		const session = await sessionRepo.findByUserKey(db, Session.userkey);
		expect(session?.Person?.tz).toBe('America/Chicago');
		expect(session?.Su?.tz).toBe('Europe/London');
	});
	it('returns the session with banned status when it exists', async () => {
		const bannedPerson = await factories.person.create({settings: { banned: '1' }});
		const Session = await factories.session.create({ person: bannedPerson.id });
		const session = await sessionRepo.findByUserKey(db, Session.userkey);
		expect(session).toBeDefined();
		expect(session?.Person?.banned).toBe('1');
	});

});

describe('updateSession', () => {
	it('updates the session when given a valid session id', async () => {
		const Session = await factories.session.create({person: Person.id});
		const newIp = '8.8.8.8';
		await sessionRepo.updateSession(db, Session.id, { ip: newIp });
		
		const updated = await sessionRepo.getSession(db, Session.id);
		expect(updated?.ip).toBe(newIp);
	});
});

describe('deleteSession', () => {
	it('deletes the session when given a valid session id', async () => {
		const Session = await factories.session.create({person: Person.id	});

		await sessionRepo.deleteSession(db, Session.id);

		const deleted = await sessionRepo.getSession(db, Session.id);
		expect(deleted).toBeUndefined();
	});
});

describe('createSession', () => {
	it('creates a session and returns mapped session with userkey', async () => {
		const Session = await sessionRepo.createSession(db, { person: Person.id });

		expect(Session.id).toBeDefined();
		expect(Session.userkey).toBeDefined();
		expect(typeof Session.userkey).toBe('string');
		const sessionInDb = await sessionRepo.getSession(db, Session.id);
		expect(sessionInDb).not.toBeUndefined();
		expect(sessionInDb?.person).toBe(Session.person);
	});

	it('generates a unique userkey for each session', async () => {
		const session1 = await sessionRepo.createSession(db, { person: Person.id });
		const session2 = await sessionRepo.createSession(db, { person: Person.id });
		expect(session1.userkey).not.toBe(session2.userkey);
	});
});

describe('push subscriptions', () => {
	const KEY = 'abcdef0123456789';
	let count = 0;
	const subscription = () => ({
		push_endpoint: `https://fcm.googleapis.com/fcm/send/${Person.id}-${++count}`,
		push_p256dh: 'p256dh',
		push_auth: 'auth',
		push_vapid_key: KEY,
	});

	describe('getPushSubscriptions', () => {
		it('returns the endpoint and keys of each live subscription', async () => {
			const Owner = await factories.person.create();
			const first = await factories.session.create({ person: Owner.id, ...subscription() });
			const second = await factories.session.create({ person: Owner.id, ...subscription() });

			const rows = await sessionRepo.getPushSubscriptions(db, Owner.id, KEY);

			expect(rows.map(row => row.id).sort()).toEqual([first.id, second.id].sort());
			expect(rows[0]).toEqual({
				id: expect.any(Number),
				push_endpoint: expect.stringContaining('https://fcm.googleapis.com/'),
				push_p256dh: 'p256dh',
				push_auth: 'auth',
			});
		});

		it('leaves out sessions that cannot receive push', async () => {
			const Owner = await factories.person.create();
			const Other = await factories.person.create();
			await factories.session.create({ person: Owner.id });
			await factories.session.create({ person: Owner.id, ...subscription(), push_disabled: 1 });
			await factories.session.create({ person: Owner.id, ...subscription(), push_vapid_key: 'fedcba9876543210' });
			await factories.session.create({ person: Owner.id, su: Other.id, ...subscription() });
			await factories.session.create({ person: Other.id, ...subscription() });

			expect(await sessionRepo.getPushSubscriptions(db, Owner.id, KEY)).toEqual([]);
		});
	});

	describe('clearPushEndpoint', () => {
		it('clears the subscription and keeps push on', async () => {
			const values = subscription();
			const Session = await factories.session.create({ person: Person.id, ...values });

			expect(await sessionRepo.clearPushEndpoint(db, Session.id, values.push_endpoint)).toBe(true);

			const row = await sessionRepo.getPushStatus(db, Session.id);
			expect(row).toMatchObject({ push_endpoint: null, push_vapid_key: null, push_disabled: 0 });
			expect(await sessionRepo.getPushSubscriptions(db, Person.id, KEY)).not.toContainEqual(expect.objectContaining({ id: Session.id }));
		});

		it('keeps a subscription saved since the endpoint was read', async () => {
			const stale = subscription();
			const fresh = subscription();
			const Session = await factories.session.create({ person: Person.id, ...fresh });

			expect(await sessionRepo.clearPushEndpoint(db, Session.id, stale.push_endpoint)).toBe(false);

			const row = await sessionRepo.getPushStatus(db, Session.id);
			expect(row?.push_endpoint).toBe(fresh.push_endpoint);
		});
	});
});
