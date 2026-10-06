
import csrfMiddleware from './csrfMiddleware.js';
import config from '../config.js';
import { createContext } from '../../tests/httpMocks.js';
import * as problem from '../helpers/problem.js';
import type { AuthInfo } from './auth/types.js';

const cookieAuth: AuthInfo = { method: 'cookie', sessionId: 1, su: null };

describe('csrfMiddleware', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		config.csrf.trusted_origins = ['https://trusted.example.com'];
	});
	

	it('skips when the request is not cookie authenticated', async () => {
		const { req, res, next } = createContext({
			method: 'POST',
			auth: { method: 'none', sessionId: null, su: null },
		});

		await csrfMiddleware(req, res, next);

		expect(next).toHaveBeenCalledOnce();
	});

	it.each(['GET', 'HEAD', 'OPTIONS'])(
		'skips CSRF check for safe method %s',
		async (method) => {
			const { req, res, next } = createContext({
				auth: cookieAuth,
				method,
			});

			await csrfMiddleware(req, res, next);

			expect(next).toHaveBeenCalledOnce();
		}
	);

	it('skips CSRF check for /auth/login', async () => {
		const { req, res, next } = createContext({
			auth: cookieAuth,
			method: 'POST',
			path: '/v1/auth/login',
		});

		await csrfMiddleware(req, res, next);

		expect(next).toHaveBeenCalledOnce();
	});

	it('allows request when Origin is trusted', async () => {

		const { req, res, next } = createContext({
			auth: cookieAuth,
			method: 'POST',
			path: '/v1/rest/anything',
			headers: {
				origin: 'https://trusted.example.com',
			},
		});

		await csrfMiddleware(req, res, next);

		expect(next).toHaveBeenCalledOnce();
	});

	it('rejects when Origin is missing', async () => {
		const spy = vi.spyOn(problem, 'Forbidden');

		const { req, res, next } = createContext({
			auth: cookieAuth,
			method: 'POST',
			path: '/v1/rest/anything',
			headers: {
				origin: undefined,
			},
		});

		await csrfMiddleware(req, res, next);

		expect(spy).toHaveBeenCalledOnce();
		expect(next).not.toHaveBeenCalled();
	});

	it('rejects when Origin is untrusted', async () => {
		const spy = vi.spyOn(problem, 'Forbidden');

		const { req, res, next } = createContext({
			auth: cookieAuth,
			method: 'POST',
			path: '/v1/rest/anything',
			headers: {
				origin: 'https://evil.trusted.example.com',
			},
		});

		await csrfMiddleware(req, res, next);

		expect(spy).toHaveBeenCalledOnce();
		expect(next).not.toHaveBeenCalled();
	});
	it('rejects when Origin is empty string', async () => {
		const spy = vi.spyOn(problem, 'Forbidden');

		const { req, res, next } = createContext({
			auth: cookieAuth,
			method: 'POST',
			path: '/v1/rest/anything',
			headers: {
				origin: '',
			},
		});

		await csrfMiddleware(req, res, next);

		expect(spy).toHaveBeenCalledOnce();
		expect(next).not.toHaveBeenCalled();
	});
	it('rejects when protocol does not match', async () => {
		const spy = vi.spyOn(problem, 'Forbidden');

		const { req, res, next } = createContext({
			auth: cookieAuth,
			method: 'POST',
			path: '/v1/rest/anything',
			headers: {
				origin: 'http://trusted.example.com',
			},
		});

		await csrfMiddleware(req, res, next);

		expect(spy).toHaveBeenCalledOnce();
		expect(next).not.toHaveBeenCalled();
	});
});
