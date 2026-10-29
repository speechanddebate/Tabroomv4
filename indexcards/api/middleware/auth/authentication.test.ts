import config from '../../config.js';
import sessionRepo from '../../repos/sessionRepo.js';
import { Authenticate } from './authentication.js';
import { createContext } from '../../../tests/httpMocks.js';
import authService from '../../services/AuthService.js';

type Session = NonNullable<Awaited<ReturnType<typeof sessionRepo.findByUserKey>>>;

const userkey = 'valid-userkey';

function mockSession(Person: Partial<Session['Person']> = {}): Session {
	return {
		id      : 1,
		ip      : null,
		su      : null,
		person  : 69,
		userkey,
		last_access : new Date(),
		Person  : {
			id         : 69,
			first      : 'I',
			last       : 'Test',
			email      : '',
			site_admin : 0,
			tz         : null,
			banned     : '0',
			...Person,
		},
		Su: null,
	};
}

describe('Authentication Middleware', () => {

	describe('No Auth', () => {
		it('calls next() and no req.person when no auth provided', async () => {
			// Arrange
			const {req, res, next} = createContext();
			// Act
			await Authenticate(req, res, next);

			// Assert
			expect(next).toHaveBeenCalled();
			expect(req.person).toBeNull();
		});
		it('attaches an anonymous actor', async () => {
			// Arrange
			const {req, res, next} = createContext();
			// Act
			await Authenticate(req, res, next);

			// Assert
			expect(req.actor).toBeDefined();
			expect(req.actor?.type).toBe('anonymous');
			expect(req.auth).toEqual({ method: 'none', sessionId: null, su: null });
		});

	});

	describe('Cookie Auth', () => {
		it('sets req.auth and req.person when valid cookie', async () => {

			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: userkey,
				},
			});
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce(mockSession());

			//Act
			await Authenticate(req, res, next);

			//Assert
			expect(next).toHaveBeenCalled();
			expect(req.person).toMatchObject({ id: 69 });
			expect(req.auth).toEqual({ method: 'cookie', sessionId: 1, su: null });
		});
		it('records the su admin on req.auth', async () => {
			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: userkey,
				},
			});
			const Su = { id: 1, first: 'Admin', last: 'Person', email: 'admin@example.com', site_admin: 1, tz: null };
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce({ ...mockSession(), su: 1, Su });

			await Authenticate(req, res, next);

			expect(req.auth.su).toEqual(Su);
			// req.person and the actor are the su target, not the admin
			expect(req.person?.id).toBe(69);
			expect(req.actor.Person?.id).toBe(69);
		});
		it('does not set req.person when invalid cookie', async () => {

			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: 'invalidcookie',
				},
			});
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce(undefined);

			//Act
			await Authenticate(req, res, next);

			//Assert
			expect(next).toHaveBeenCalled();
			expect(req.person).toBeNull();
			expect(req.auth.method).toBe('none');
			expect(req.actor.type).toBe('anonymous');
		});
		it('clears an invalid cookie', async () => {
			// if the user provides and invalid cookie. we should tell the browser to clear it.
			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: 'invalidcookie',
				},
			});
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce(undefined);

			//Act
			await Authenticate(req, res, next);

			//Assert
			expect(res.clearCookie).toHaveBeenCalledWith(config.cookie.name, authService.getAuthCookieOptions());
		});
		it('calls next(err) on sessionRepo error', async () => {

			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: 'somecookie',
				},
			});
			vi.spyOn(sessionRepo, 'findByUserKey').mockRejectedValueOnce(new Error('Database error'));

			//Act
			await Authenticate(req, res, next);

			//Assert
			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
		it('attaches actor with correct info', async () => {
			// Arrange
			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: userkey,
				},
			});
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce(mockSession());

			// Act
			await Authenticate(req, res, next);

			// Assert
			expect(req.actor?.type).toBe('person');
			expect(req.actor?.Person?.id).toBe(69);
		});
		it('returns 403 when user is banned', async () => {
			const { req, res, next } = createContext({
				cookies: {
					[config.cookie.name]: 'somecookie',
				},
			});
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce(mockSession({ banned: '1' }));
			vi.spyOn(sessionRepo, 'deleteSession').mockResolvedValueOnce();

			//Act
			await Authenticate(req, res, next);

			//Assert
			expect(res.status).toHaveBeenCalledWith(403);
			expect(next).not.toHaveBeenCalled();
		});

	});

	describe('last_access upkeep', () => {
		const hour = 60 * 60 * 1000;
		const context = () => createContext({
			cookies: {
				[config.cookie.name]: userkey,
			},
		});

		it('does not rewrite a last_access from within the hour', async () => {
			const { req, res, next } = context();
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce({
				...mockSession(),
				last_access: new Date(Date.now() - (hour / 2)),
			});
			const touch = vi.spyOn(sessionRepo, 'updateSession').mockResolvedValueOnce();

			await Authenticate(req, res, next);

			expect(touch).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith();
		});
		it('sets a null last_access', async () => {
			const { req, res, next } = context();
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce({ ...mockSession(), last_access: null });
			const touch = vi.spyOn(sessionRepo, 'updateSession').mockResolvedValueOnce();

			await Authenticate(req, res, next);

			expect(touch).toHaveBeenCalledWith(req.db, 1, { last_access: expect.any(Date) });
			expect(next).toHaveBeenCalledWith();
		});
		it('refreshes a last_access older than an hour', async () => {
			const { req, res, next } = context();
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce({
				...mockSession(),
				last_access: new Date(Date.now() - (2 * hour)),
			});
			const touch = vi.spyOn(sessionRepo, 'updateSession').mockResolvedValueOnce();

			await Authenticate(req, res, next);

			expect(touch).toHaveBeenCalledWith(req.db, 1, { last_access: expect.any(Date) });
		});
		it('refreshes a stale last_access while su\'d', async () => {
			const { req, res, next } = context();
			const Su = { id: 1, first: 'Admin', last: 'Person', email: 'admin@example.com', site_admin: 1, tz: null };
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce({
				...mockSession(),
				su: 1,
				Su,
				last_access: new Date(Date.now() - (2 * hour)),
			});
			const touch = vi.spyOn(sessionRepo, 'updateSession').mockResolvedValueOnce();

			await Authenticate(req, res, next);

			expect(touch).toHaveBeenCalledWith(req.db, 1, { last_access: expect.any(Date) });
			expect(req.auth.su).toEqual(Su);
		});
		it('does not touch a banned session', async () => {
			const { req, res, next } = context();
			vi.spyOn(sessionRepo, 'findByUserKey').mockResolvedValueOnce({
				...mockSession({ banned: '1' }),
				last_access: null,
			});
			vi.spyOn(sessionRepo, 'deleteSession').mockResolvedValueOnce();
			const touch = vi.spyOn(sessionRepo, 'updateSession').mockResolvedValueOnce();

			await Authenticate(req, res, next);

			expect(touch).not.toHaveBeenCalled();
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe('Header tokens', () => {
		// only cookie auth is supported until API keys are issued
		it.each([
			['Bearer token', { authorization: `Bearer ${userkey}` }],
			['Basic auth', { authorization: `Basic ${Buffer.from('123:myapikey').toString('base64')}` }],
			['session header', { 'tabroom-session': userkey }],
		])('ignores a %s', async (_name, headers) => {
			const { req, res, next } = createContext({ headers });
			const findByUserKey = vi.spyOn(sessionRepo, 'findByUserKey');

			//Act
			await Authenticate(req, res, next);

			//Assert
			expect(findByUserKey).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledWith();
			expect(req.person).toBeNull();
		});
	});
});
