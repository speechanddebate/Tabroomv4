import type { RequestEvent } from '@sveltejs/kit';
import type { MockedFunction } from 'vitest';

vi.mock('$app/env/public', () => ({
	INDEXCARDS_HOST: 'https://api.example.com',
	INDEXCARDS_BASE_PATH: '/v1',
}));
vi.mock('$app/env/private', () => ({
	AUTH_COOKIE: 'Tabroom_Cookie',
}));

const { mockUserSession } = vi.hoisted(() => ({
	mockUserSession: vi.fn(),
}));

vi.mock('$indexcards', () => ({
	userSession: mockUserSession,
}));

const { logger } = vi.hoisted(() => ({
	logger: {
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock('$lib/helpers/logging/logging.server', () => ({ default: logger }));

import { handle, handleError, handleFetch } from './hooks.server';

type RequestEventOverrides = Omit<Partial<RequestEvent>, 'cookies' | 'locals'> & {
	cookies?: Partial<RequestEvent['cookies']>;
	locals?: Partial<RequestEvent['locals']>;
};

const createRequestEvent = (overrides: RequestEventOverrides = {}): RequestEvent => ({
	cookies: {
		get: vi.fn(),
		getAll: vi.fn().mockReturnValue([]),
		set: vi.fn(),
		delete: vi.fn(),
		serialize: vi.fn(),
		...overrides.cookies,
	},
	fetch: vi.fn(),
	getClientAddress: vi.fn().mockReturnValue('127.0.0.1'),
	locals: {
		requestId: 'req-default',
		Session: null,
		...overrides.locals,
	},
	params: {},
	platform: undefined,
	request: new Request('https://schemats.test/'),
	route: { id: '/' },
	setHeaders: vi.fn(),
	url: new URL('https://schemats.test/'),
	isDataRequest: false,
	isSubRequest: false,
	tracing: undefined,
	...overrides,
}) as RequestEvent;

describe('Handle Hook', () => {
	it('generates a requestId and continues without session if no auth cookie', async () => {
		const event = createRequestEvent({
			cookies: {
				get: vi.fn().mockReturnValue(undefined),
			},
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		const response = await handle({ event, resolve });

		expect(event.locals.requestId).toBeDefined();
		expect(event.locals.Session).toBeNull();
		expect(resolve).toHaveBeenCalledWith(event);
		expect(response).toEqual(new Response('ok'));
	});
	it('bootstraps user session and attaches to locals', async () => {
		const sessionData = { Person: { id: 1, name: 'Alice' } };
		mockUserSession.mockResolvedValue({ status: 200, data: sessionData });
		const event = createRequestEvent({
			cookies: {
				get: vi.fn((name: string) => (name === 'Tabroom_Cookie' ? 'session-123' : undefined)),
			},
			request: new Request('https://schemats.test/dashboard', { method: 'GET' }),
			url: new URL('https://schemats.test/dashboard'),
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		const response = await handle({ event, resolve });

		expect(event.locals.Session).toEqual(sessionData);
		expect(resolve).toHaveBeenCalledWith(event);
		expect(response).toEqual(new Response('ok'));
	});
	it('continues without session if api returns 401', async () => {
		mockUserSession.mockResolvedValue({ status: 401, data: {} });
		const event = createRequestEvent({
			cookies: {
				get: vi.fn((name: string) => (name === 'Tabroom_Cookie' ? 'session-123' : undefined)),
			},
			request: new Request('https://schemats.test/dashboard', { method: 'GET' }),
			url: new URL('https://schemats.test/dashboard'),
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		const response = await handle({ event, resolve });

		expect(event.locals.Session).toBeNull();
		expect(resolve).toHaveBeenCalledWith(event);
		expect(response).toEqual(new Response('ok'));
	});
	it('logs and continues if session bootstrap returns non-401 error', async () => {
		mockUserSession.mockResolvedValue({ status: 500, data: { error: 'Server error' } });
		const event = createRequestEvent({
			cookies: {
				get: vi.fn((name: string) => (name === 'Tabroom_Cookie' ? 'session-123' : undefined)),
			},
			request: new Request('https://schemats.test/dashboard', { method: 'GET' }),
			url: new URL('https://schemats.test/dashboard'),
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		const response = await handle({ event, resolve });

		expect(logger.warn).toHaveBeenCalledWith(
			'Session bootstrap failed',
			expect.objectContaining({
				requestId: expect.any(String),
				path: '/dashboard',
				error: expect.objectContaining({
					error: 'Server error',
				}),
			})
		);
		expect(response).toEqual(new Response('ok'));
	});

	it('logs and continues if session bootstrap fetch fails', async () => {
		mockUserSession.mockRejectedValueOnce(new Error('session endpoint down'));
		const event = createRequestEvent({
			cookies: {
				get: vi.fn((name: string) => (name === 'Tabroom_Cookie' ? 'session-123' : undefined)),
			},
			request: new Request('https://schemats.test/dashboard', { method: 'GET' }),
			url: new URL('https://schemats.test/dashboard'),
		});
		const resolve = vi.fn().mockResolvedValue(new Response('ok'));

		const response = await handle({ event, resolve });

		expect(logger.warn).toHaveBeenCalledWith(
			'Session bootstrap failed',
			expect.objectContaining({
				requestId: expect.any(String),
				path: '/dashboard',
				error: expect.any(Error),
			})
		);
		expect(response).toEqual(new Response('ok'));
	});
});

describe('HandleFetch Hook', () => {
	let mockFetch: MockedFunction<typeof fetch>;

	beforeEach(() => {
		mockFetch = vi.fn().mockResolvedValue(new Response('ok')) as MockedFunction<typeof fetch>;
	});

	it('forwards cookies for indexcards API requests', async () => {
		const event = createRequestEvent({
			request: new Request('https://example.com/some-page', {
				headers: { cookie: 'session=abc123; Browser_Id=browser-id-123' },
			}),
		});
		const request = new Request('https://api.example.com/v1/user', { method: 'POST' });

		await handleFetch({ event, request, fetch: mockFetch });

		expect(request.headers.get('cookie')).toBe('session=abc123; Browser_Id=browser-id-123');
		expect(mockFetch).toHaveBeenCalledWith(request);
	});

	it('does not forward cookies for non-indexcards requests', async () => {
		const event = createRequestEvent({
			request: new Request('https://example.com/page', {
				headers: { cookie: 'session=abc123' },
			}),
		});
		const request = new Request('https://external.com/api/data', { method: 'GET' });

		await handleFetch({ event, request, fetch: mockFetch });

		expect(request.headers.get('cookie')).toBeNull();
		expect(mockFetch).toHaveBeenCalledWith(request);
	});

	it('handles missing cookies in event.request gracefully', async () => {
		const event = createRequestEvent({
			request: new Request('https://example.com/page'),
		});
		const request = new Request('https://api.example.com/v1/user', { method: 'GET' });

		await handleFetch({ event, request, fetch: mockFetch });

		expect(request.headers.get('cookie')).toBe('');
	});

	it('passes through fetch response unchanged', async () => {
		const mockResponse = new Response('response data', { status: 201 });
		mockFetch.mockResolvedValueOnce(mockResponse);

		const event = createRequestEvent({
			request: new Request('https://example.com', { headers: {} }),
		});
		const request = new Request('https://api.example.com/v1/user', { method: 'POST' });

		const result = await handleFetch({ event, request, fetch: mockFetch });

		expect(result).toBe(mockResponse);
	});
});

describe('HandleError Hook', () => {
	it('logs unhandled errors with request metadata and returns error message and id', () => {
		const error = new Error('Something went wrong');
		const event = createRequestEvent({
			locals: { requestId: 'error-123', Session: null },
			request: new Request('https://schemats.test/profile', { method: 'POST' }),
			url: new URL('https://schemats.test/profile?edit=true'),
		});

		const result = handleError({
			error,
			event,
			status: 500,
			message: 'Internal Server Error',
		});

		expect(logger.error).toHaveBeenCalledWith(
			'Unhandled request error',
			expect.objectContaining({
				errorId: 'error-123',
				status: 500,
				method: 'POST',
				path: '/profile',
				search: '?edit=true',
				error,
			})
		);
		expect(result).toEqual({
			message: 'Internal Server Error',
			errorId: 'error-123',
		});
	});
});
