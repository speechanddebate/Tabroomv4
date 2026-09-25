
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
