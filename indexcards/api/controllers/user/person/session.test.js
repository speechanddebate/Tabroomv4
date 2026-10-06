import { createContext } from '../../../../tests/httpMocks.js';
import { getSession } from './session.js';

describe('getSession', () => {
	it('should return session data if session exists', async () => {
		const Person = { id: 123, first: 'Test', last: 'User' };
		const { req, res } = createContext({
			auth: { method: 'cookie', sessionId: 7, su: null },
			person: Person,
		});
		await getSession(req, res);
		expect(res.statusCode).toBe(200);
		expect(res.body).toEqual({ id: 7, person: 123, su: null, Su: null, Person });
	});

	it('includes the su admin while su\'d', async () => {
		const Su = { id: 1, first: 'Admin', last: 'Person' };
		const { req, res } = createContext({
			auth: { method: 'cookie', sessionId: 7, su: Su },
			person: { id: 123 },
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
