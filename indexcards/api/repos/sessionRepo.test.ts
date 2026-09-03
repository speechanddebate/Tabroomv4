
import sessionRepo from './sessionRepo.js';
import { db } from '../data/database.js';
import factories from '../../tests/factories/index.js';

const { personId }: { personId: number } = await factories.person.create();

describe('sessionRepo', () => {

	describe('getSession', () => {
		it('returns null when session does not exist', async () => {
			const session = await sessionRepo.getSession(db, 999999);
			expect(session).toBeUndefined();
		});
		it('returns the session when it exists', async () => {
			const { sessionId } = await factories.session.create({ person: personId });
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
			const { sessionId, userkey } = await factories.session.create({person: personId});
			const session = await sessionRepo.findByUserKey(db, userkey as string);
			expect(session).toBeDefined();
			expect(session?.id).toBe(sessionId);
			expect(session?.Person?.id).toBe(personId);
		});
	});

	describe('deleteSession', () => {
		it('deletes the session when given a valid session id', async () => {
			const { sessionId } = await factories.session.create({person: personId});

			await sessionRepo.deleteSession(db, sessionId);

			const deleted = await sessionRepo.getSession(db, sessionId);
			expect(deleted).toBeUndefined();
		});
	});

	describe('createSession', () => {
		it('creates a session and returns mapped session with userkey', async () => {
			const { id, userkey } = await sessionRepo.createSession(db, { person: personId });

			expect(id).toBeDefined();
			expect(userkey).toBeDefined();
			expect(typeof userkey).toBe('string');
			const sessionInDb = await sessionRepo.getSession(db, id);
			expect(sessionInDb).not.toBeUndefined();
			expect(sessionInDb?.person).toBe(personId);
		});

		it('generates a unique userkey for each session', async () => {
			const session1 = await sessionRepo.createSession(db, { person: personId });
			const session2 = await sessionRepo.createSession(db, { person: personId });
			expect(session1.userkey).not.toBe(session2.userkey);
		});
	});
});
