import { POST } from './+server';
import * as loggingModule from '#lib/helpers/logging/logging.server.ts';

vi.mock('#lib/helpers/logging/logging.server.ts', () => ({
	default: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	},
}));

const postWithRequest = async (request: Request) => {
	return POST({ request } as unknown as Parameters<typeof POST>[0]);
};

describe('POST /log', () => {
	it('should log valid error payload', async () => {
		const logger = loggingModule.default;
		const request = new Request('http://localhost/log', {
			method: 'POST',
			body: JSON.stringify({
				level: 'error',
				message: 'Client error occurred',
				error: {
					message: 'Something went wrong',
					stack: 'Error: Something went wrong\n    at ...',
				},
				context: { page: '/app' },
			}),
		});

		const response = await postWithRequest(request);

		expect(response.status).toBe(200);
		expect(logger.error).toHaveBeenCalledWith('Client error', expect.objectContaining({
			message: 'Client error occurred',
			errorStack: 'Error: Something went wrong\n    at ...',
			page: '/app',
		}));
	});

	it('should reject payload missing level', async () => {
		const request = new Request('http://localhost/log', {
			method: 'POST',
			body: JSON.stringify({
				message: 'No level provided',
			}),
		});

		const response = await postWithRequest(request);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain('Missing level or message');
	});

	it('should reject payload missing message', async () => {
		const request = new Request('http://localhost/log', {
			method: 'POST',
			body: JSON.stringify({
				level: 'error',
			}),
		});

		const response = await postWithRequest(request);

		expect(response.status).toBe(400);
	});

	it('leaves invalid JSON to handleError', async () => {
		const request = new Request('http://localhost/log', {
			method: 'POST',
			body: 'invalid json {',
		});

		await expect(postWithRequest(request)).rejects.toThrow(SyntaxError);
	});

	it('should support different log levels', async () => {
		const logger = loggingModule.default;

		for (const level of ['error', 'warn', 'info', 'debug']) {

			const request = new Request('http://localhost/log', {
				method: 'POST',
				body: JSON.stringify({
					level,
					message: `Test ${level}`,
				}),
			});

			const response = await postWithRequest(request);

			expect(response.status).toBe(200);
			expect(logger[level as keyof typeof logger]).toHaveBeenCalled();
		}
	});
});
