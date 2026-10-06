// src/hooks.client.test.ts

vi.mock('$app/env/public', () => ({
	INDEXCARDS_HOST: 'https://api.example.com',
	CLASSIC_URL: 'https://classic.example.com',
	COOKIE_DOMAIN: 'example.com',
	BROWSER_ID_COOKIE_NAME: 'browser_id',
}));

const {
	mockClientLoggerError,
	mockClientLoggerWarn,
	mockClientLoggerInfo,
	mockClientLoggerDebug,
} = vi.hoisted(() => ({
	mockClientLoggerError: vi.fn(),
	mockClientLoggerWarn: vi.fn(),
	mockClientLoggerInfo: vi.fn(),
	mockClientLoggerDebug: vi.fn(),
}));

vi.mock('$lib/helpers/logging/logging', async () => {
	const actual = await vi.importActual<typeof import('$lib/helpers/logging/logging')>(
		'$lib/helpers/logging/logging',
	);

	return {
		...actual,
		clientLogger: {
			error: mockClientLoggerError,
			warn: mockClientLoggerWarn,
			info: mockClientLoggerInfo,
			debug: mockClientLoggerDebug,
		},
	};
});

import * as hooksClient from './hooks.client';

const { init } = hooksClient;

// document.cookie only keeps the last write here, which is all these tests need
let cookieJar: string;
let store: Map<string, string>;

beforeEach(() => {
	cookieJar = '';
	store = new Map<string, string>();
	// node's own localStorage global shadows jsdom's and is undefined without --localstorage-file
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
	});
	Object.defineProperty(document, 'cookie', {
		configurable: true,
		get: () => cookieJar,
		set: (value: string) => {
			cookieJar = value;
		},
	});
});

describe('handleClientError', () => {
	it('posts SvelteKit client hook errors caught by handleError to the server log endpoint', async () => {
		const handleError = (hooksClient as Record<string, unknown>).handleError as
			| ((input: {
					error: unknown;
					event: { url: URL } | null;
					status: number;
					message: string;
				}) => unknown)
			| undefined;

		expect(typeof handleError).toBe('function');
		if (!handleError) {
			return;
		}

		await handleError({
			error: new Error('svelte blew up'),
			event: { url: new URL('https://schemats.test/paradigms') },
			status: 500,
			message: 'Internal Error',
		});

		expect(mockClientLoggerError).toHaveBeenCalledWith(
			'Internal Error',
			expect.objectContaining({
				error: expect.any(Error),
				status: 500,
				path: '/paradigms',
				source: 'handleError',
			}),
		);
	});
});

describe('Client Init', () => {
	it('sets the browser id cookie', async () => {
		await init();

		expect(cookieJar).toMatch(/^browser_id=[0-9a-f-]{36};/);
	});

	describe('global error handling', () => {
		beforeEach(() => {
			mockClientLoggerError.mockReset();
		});

		it('posts uncaught browser errors to the server log endpoint', async () => {
			await init();

			const event = new Event('error');
			Object.defineProperties(event, {
				message: {
					configurable: true,
					value: 'uncaught browser error',
				},
				error: {
					configurable: true,
					value: new Error('uncaught browser error'),
				},
			});

			window.dispatchEvent(event);

			expect(mockClientLoggerError).toHaveBeenCalledWith(
				'uncaught browser error',
				expect.objectContaining({
					error: expect.any(Error),
					kind: 'error',
					source: 'window.error',
				}),
			);
		});

		it('posts unhandled promise rejections to the server log endpoint', async () => {
			await init();

			const event = new Event('unhandledrejection');
			Object.defineProperty(event, 'reason', {
				configurable: true,
				value: new Error('async failure'),
			});

			window.dispatchEvent(event);

			expect(mockClientLoggerError).toHaveBeenCalledWith(
				'async failure',
				expect.objectContaining({
					error: expect.any(Error),
					kind: 'unhandledrejection',
					source: 'window.unhandledrejection',
				}),
			);
		});
	});
});

describe('getCookieValue', () => {
	it('extracts the value of a cookie by name', () => {
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => 'foo=bar; test_cookie=abc123; hello=world',
		});

		expect(hooksClient.getCookieValue('test_cookie')).toBe('abc123');
		expect(hooksClient.getCookieValue('foo')).toBe('bar');
		expect(hooksClient.getCookieValue('hello')).toBe('world');
		expect(hooksClient.getCookieValue('nonexistent')).toBeUndefined();
	});
	it('returns undefined and logs warning if the cookie is malformed', () => {
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => 'foo=bar; malformed_cookie=; hello=world',
		});

		expect(hooksClient.getCookieValue('malformed_cookie')).toBeUndefined();
		expect(mockClientLoggerWarn).toHaveBeenCalledWith(
			expect.stringContaining('cookie "malformed_cookie" was malformed'),
		);
	});
	it('returns undefined and logs warning if document is undefined', () => {
		const originalDocument = global.document;
		try {
			Object.defineProperty(global, 'document', {
				configurable: true,
				value: undefined,
			});

			expect(hooksClient.getCookieValue('any_cookie')).toBeUndefined();
			expect(mockClientLoggerWarn).toHaveBeenCalledWith(
				expect.stringContaining('document is undefined'),
			);
		} finally {
			Object.defineProperty(global, 'document', {
				configurable: true,
				value: originalDocument,
			});
		}
	});
});

describe('ensureBrowserId', () => {
	it('creates a new id in a persistent cookie on the shared domain and in localStorage', () => {
		const id = hooksClient.ensureBrowserId();

		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(cookieJar).toBe(`browser_id=${id}; Path=/; Max-Age=34560000; SameSite=Lax; Domain=example.com`);
		expect(store.get('browser_id')).toBe(id);
	});

	it('reuses the id from the cookie and mirrors it into localStorage', () => {
		cookieJar = 'browser_id=cookie-id';

		expect(hooksClient.ensureBrowserId()).toBe('cookie-id');
		expect(cookieJar).toMatch(/^browser_id=cookie-id; .*Max-Age=/);
		expect(store.get('browser_id')).toBe('cookie-id');
	});

	it('restores the cookie from localStorage when the cookie was cleared', () => {
		store.set('browser_id', 'stored-id');

		expect(hooksClient.ensureBrowserId()).toBe('stored-id');
		expect(cookieJar).toMatch(/^browser_id=stored-id;/);
	});

	it('still sets the cookie when localStorage is unavailable', () => {
		vi.stubGlobal('localStorage', undefined);

		const id = hooksClient.ensureBrowserId();

		expect(cookieJar).toMatch(new RegExp(`^browser_id=${id};`));
		expect(mockClientLoggerWarn).toHaveBeenCalledWith(
			'could not read browser id from localStorage',
			expect.anything(),
		);
	});
});
