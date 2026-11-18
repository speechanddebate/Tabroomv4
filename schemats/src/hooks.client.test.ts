// src/hooks.client.test.ts

vi.mock('$app/env/public', () => ({
	INDEXCARDS_HOST: 'https://api.example.com',
	CLASSIC_URL: 'https://classic.example.com',
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

vi.mock('#lib/helpers/logging/logging.ts', async () => {
	const actual = await vi.importActual<typeof import('#lib/helpers/logging/logging.ts')>(
		'#lib/helpers/logging/logging.ts',
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

describe('handleClientError', () => {
	const handleError = (hooksClient as Record<string, unknown>).handleError as (input: {
		kind: string;
		error: unknown;
		event: { url: URL } | null;
	}) => unknown;
	const event = { url: new URL('https://schemats.test/paradigms') };

	beforeEach(() => {
		mockClientLoggerError.mockReset();
	});

	it('posts SvelteKit client hook errors caught by handleError to the server log endpoint', async () => {
		const result = await handleError({ kind: 'unknown', error: new Error('svelte blew up'), event });

		expect(mockClientLoggerError).toHaveBeenCalledWith(
			'Unhandled client error',
			expect.objectContaining({
				error: expect.any(Error),
				kind: 'unknown',
				status: 500,
				path: '/paradigms',
				source: 'handleError',
			}),
		);
		expect(result).toEqual({ errorId: 'client-error' });
	});

	it('does not log errors thrown with error()', async () => {
		await handleError({ kind: 'app', error: { status: 404, message: 'Not Found' }, event });

		expect(mockClientLoggerError).not.toHaveBeenCalled();
	});
});

describe('Client Init', () => {
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
