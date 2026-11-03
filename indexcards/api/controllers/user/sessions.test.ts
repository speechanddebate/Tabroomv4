import { createContext } from '../../../tests/httpMocks.js';
import { getSession } from './sessions.js';
import type { SessionPerson } from '../../middleware/auth/types.js';

const person = (overrides: Partial<SessionPerson> = {}): SessionPerson => ({
	id: 123,
	first: 'Test',
	last: 'User',
	email: 'test@example.com',
	site_admin: 0,
	...overrides,
});

describe('getSession', () => {
	it('should return session data if session exists', async () => {
		const Person = person();
		const { req, res } = createContext({
			auth: { method: 'cookie', sessionId: 7, su: null },
			person: Person,
		});
		await getSession(req, res);
		expect(res.statusCode).toBe(200);
		expect(res.body).toEqual({ id: 7, person: 123, su: null, Su: null, Person });
	});

	it('includes the su admin while su\'d', async () => {
		const Su = person({ id: 1, first: 'Admin', last: 'Person', site_admin: 1 });
		const { req, res } = createContext({
			auth: { method: 'cookie', sessionId: 7, su: Su },
			person: person(),
		});
		await getSession(req, res);
		expect(res.body).toMatchObject({ person: 123, su: 1, Su });
	});

	it('should return 404 if no session exists', async () => {
		const { req, res } = createContext();
		await getSession(req, res);
		expect(res).toBeProblemResponse(404);
	});
});
