
import config from '../config.js';
import { createContext } from '../../tests/httpMocks.js';
import * as controller from './authController.js';
import authService,{ AUTH_INVALID} from '../services/AuthService.js';
import sessionRepo from '../repos/sessionRepo.js';
import { ValidationError } from '../helpers/errors/errors.js';
import personRepo from '../repos/personRepo.js';

describe('authController',() => {
	describe('login', () => {
		it('returns 401 when credentials are invalid', async () => {
			vi.spyOn(authService, 'login').mockRejectedValue(AUTH_INVALID);

			const { req, res } = createContext({
				body: { username: 'bob', password: 'wrong' },
				ip: '127.0.0.1',
			});

			await controller.login(req, res);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledTimes(1);
		});
		it('throws on error other than AUTH_INVALID', async () => {
			vi.spyOn(authService, 'login').mockRejectedValue(new Error('Some other error'));
			const { req, res } = createContext({
				body: { username: 'alice', password: 'badpassword' },
				ip: '127.0.0.1',
			});
			await expect(controller.login(req, res)).rejects.toThrow('Some other error');
		});

		it('sets cookies and returns token + user on success', async () => {
			const fakeResult = {
				token: 'jwt123',
				person: { id: 42, email: 'test@test.com' },
				defaults: { theme: 'dark' },
			};

			vi.spyOn(authService, 'login').mockResolvedValue(fakeResult);

			const { req, res } = createContext({
				body: { username: 'bob', password: 'pw' },
				ip: '127.0.0.1',
			});

			await controller.login(req, res);

			// Auth service called correctly
			expect(authService.login.mock.calls[0][0]).toBe('bob');
			expect(authService.login.mock.calls[0][1]).toBe('pw');

			// Auth cookie
			expect(res.cookie).toHaveBeenCalledWith(config.cookie.name, 'jwt123', expect.anything());

			// Response body
			const json = res.json.mock.calls[0][0];
			expect(json.token).toBe('jwt123');
			expect(json.Person.id).toBe(42);
			expect(json.Person.email).toBe('test@test.com');
		});

	});
	describe('logout',() => {
		it('returns 204 and deletes session when logged in', async () => {
			// Arrange
			const spy = vi
              .spyOn(sessionRepo, 'deleteSession');

			const { req, res, next } = createContext({
				auth: { method: 'cookie', sessionId: 1, su: null },
			});

			// Act
			await controller.logout(req, res, next);

			// Assert
			expect(spy).toHaveBeenCalledExactlyOnceWith(expect.anything(), 1);

			expect(res.clearCookie).toHaveBeenCalledWith(config.cookie.name,expect.any(Object));

			expect(res.status).toHaveBeenCalledWith(204);
			expect(res.send).toHaveBeenCalled();

			expect(next).not.toHaveBeenCalled();
		});
		it('return 204 when no user logged in',async () => {
			// Arrange
			const spy = vi
            .spyOn(sessionRepo, 'deleteSession');

			const { req, res, next } = createContext();

			// Act
			await controller.logout(req, res, next);

			// Assert
			expect(spy).not.toHaveBeenCalled();

			expect(res.clearCookie).toHaveBeenCalledWith(config.cookie.name,expect.any(Object));

			expect(res.status).toHaveBeenCalledWith(204);
			expect(res.send).toHaveBeenCalled();

			expect(next).not.toHaveBeenCalled();
		});
	});
	describe('su', () => {
		it('returns 200 when successful', async () => {
			const { req, res } = createContext({
				auth: { method: 'cookie', sessionId: 1, su: null },
				person: { id: 1 },
				body: { suId: 2 },
			});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({ id: 2 });
			const spy = vi.spyOn(sessionRepo, 'updateSession');
			spy.mockResolvedValue();
			await controller.su(req, res);
			expect(spy).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(204);
		});

		it('returns 400 when no session', async () => {
			const { req, res } = createContext({
				body: { suId: '1' },
			});
			await controller.su(req, res);
			expect(res.status).toHaveBeenCalledWith(400);
		});
		it('returns 400 when malformed suId', async () => {
			const { req, res } = createContext({
				auth: { method: 'cookie', sessionId: 1, su: null },
				person: { id: 2 },
				body: { suId: 'not an id' },
			});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue(null);
			await controller.su(req, res);
			expect(res.status).toHaveBeenCalledWith(400);
		});
		it('returns 400 when target not found', async () => {
			const { req, res } = createContext({
				auth: { method: 'cookie', sessionId: 1, su: null },
				person: { id: 2 },
				body: { suId: 1 },
			});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue(undefined);
			await controller.su(req, res);
			expect(res.status).toHaveBeenCalledWith(400);
		});

		it('returns 400 when target is same as current user', async () => {
			// session id differs from the person id so this checks the person, not the session
			const { req, res } = createContext({
				auth: { method: 'cookie', sessionId: 99, su: null },
				person: { id: 2 },
				body: { suId: 2 },
			});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({ id: 2 });
			await controller.su(req, res);
			expect(res.status).toHaveBeenCalledWith(400);
		});
	});
	describe('suEnd', () => {
		it('returns 204 when successful', async () => {
			const { req, res } = createContext({
				auth: { method: 'cookie', sessionId: 1, su: { id: 2 } },
				person: { id: 1 },
			});
			const spy = vi.spyOn(sessionRepo, 'updateSession');
			spy.mockResolvedValue();
			await controller.suEnd(req, res);
			expect(spy).toHaveBeenCalledWith(expect.anything(), 1, { person: 2, su: null });
			expect(res.status).toHaveBeenCalledWith(204);
		});
		it('returns 400 when no session', async () => {
			const { req, res } = createContext();
			await controller.suEnd(req, res);
			expect(res.status).toHaveBeenCalledWith(400);
		});
		it('returns 400 when no Su session', async () => {
			const { req, res } = createContext({
				auth: { method: 'cookie', sessionId: 1, su: null },
				person: { id: 1 },
			});
			await controller.suEnd(req, res);
			expect(res.status).toHaveBeenCalledWith(400);
		});
	});

	describe('register', () => {
		it('returns 201 and result on successful registration', async () => {
			const fakeResult = {
				token: 'jwt456',
				personId: 55,
			};
			vi.spyOn(authService, 'register').mockResolvedValue(fakeResult);

			const { req, res } = createContext({
				body: { username: 'newuser', password: 'pw' },
				ip: '127.0.0.1',
				get: () => 'Mozilla',
			});

			await controller.register(req, res);

			expect(authService.register).toHaveBeenCalledWith(
				req.body,
				{ ip: req.ip, agentData: 'Mozilla' }
			);
			expect(res.json).toHaveBeenCalledWith(fakeResult);
			expect(res.cookie).toHaveBeenCalledWith(config.cookie.name, 'jwt456', expect.any(Object));
		});

		it('returns 400 on ValidationError', async () => {
			vi.spyOn(authService, 'register').mockRejectedValue(new ValidationError('Invalid data'));

			const { req, res } = createContext({
				body: { username: '', password: '' },
				ip: '127.0.0.1',
			});

			await controller.register(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		it('does not catch other errors', async () => {
			vi.spyOn(authService, 'register').mockRejectedValue(new Error('Unexpected error'));

			const { req, res } = createContext({
				body: { username: 'fail', password: 'fail' },
				ip: '127.0.0.1',
			});

			await expect(controller.register(req, res)).rejects.toThrow('Unexpected error');
		});
	});
});
