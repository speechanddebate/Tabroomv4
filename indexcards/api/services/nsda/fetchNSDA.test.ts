import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import config from '../../config.js';
import { fetchNSDA, isNSDAConfigured, NSDAError } from './fetchNSDA.js';

const json = (body: unknown, status = 200, statusText = 'OK') => new Response(JSON.stringify(body), { status, statusText, headers: { 'Content-Type': 'application/json' } });

describe('fetchNSDA', () => {
	const nsda = { ...config.nsda };
	const fetchMock = vi.fn<typeof fetch>();

	beforeAll(() => {
		Object.assign(config.nsda, { endpoint: 'https://api.nsda.example', path: '/v2', user_id: '42', key: 'secret' });
	});

	afterAll(() => {
		config.nsda = nsda;
	});

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('gets a path under the configured address and version, logged in, and returns the JSON', async () => {
		fetchMock.mockResolvedValue(json([{ id: 1 }]));

		await expect(fetchNSDA('/learn/courses/117271')).resolves.toEqual([{ id: 1 }]);

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://api.nsda.example/v2/learn/courses/117271', expect.objectContaining({
			method: 'GET',
			signal: expect.any(AbortSignal),
			headers: {
				Authorization: `Basic ${Buffer.from('42:secret').toString('base64')}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}));
		expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
	});

	it('sends a body as JSON with the method asked for', async () => {
		fetchMock.mockResolvedValue(json({ posted: 3 }));

		await expect(fetchNSDA('/autopoints', { method: 'POST', body: { points: [1, 2, 3] } })).resolves.toEqual({ posted: 3 });

		expect(fetchMock).toHaveBeenCalledWith('https://api.nsda.example/v2/autopoints', expect.objectContaining({ method: 'POST', body: '{"points":[1,2,3]}' }));
	});

	it('returns nothing for an answer with no content', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

		await expect(fetchNSDA('/members/5001/emma', { method: 'DELETE' })).resolves.toBeUndefined();
	});

	it('throws with the status and the start of the body when the API answers with an error', async () => {
		fetchMock.mockResolvedValue(json({ message: 'Not authorized to view NSDA Learn info' }, 403, 'Forbidden'));

		const error = await fetchNSDA('/learn/courses/117271').catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(NSDAError);
		expect(error).toMatchObject({
			status: 403,
			message: 'The NSDA API answered GET /learn/courses/117271 with 403 Forbidden: {"message":"Not authorized to view NSDA Learn info"}',
		});
	});

	it('throws when the API cannot be reached, keeping the cause', async () => {
		const cause = new TypeError('fetch failed');
		fetchMock.mockRejectedValue(cause);

		const error = await fetchNSDA('/learn/courses/117271').catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(NSDAError);
		expect(error).toMatchObject({ message: 'The NSDA API could not be reached for GET /learn/courses/117271: fetch failed', cause });
		expect((error as NSDAError).status).toBeUndefined();
	});

	it('gives up when the API takes longer than the timeout', async () => {
		fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
		}));

		await expect(fetchNSDA('/learn/courses/117271', { timeout: 20 })).rejects.toThrow('The NSDA API did not answer GET /learn/courses/117271 within 0.02 seconds');
	});

	it('throws when the body is not JSON', async () => {
		fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 200 }));

		await expect(fetchNSDA('/learn/courses/117271')).rejects.toMatchObject({
			name: 'NSDAError',
			status: 200,
			message: 'The NSDA API answered GET /learn/courses/117271 with a body that is not JSON',
		});
	});

	it('leaves the query string, which can hold an email address, out of its errors', async () => {
		fetchMock.mockResolvedValue(json({}, 500, 'Internal Server Error'));

		const error = await fetchNSDA('/search?q=dana@school.org&type=members').catch((caught: unknown) => caught);

		expect((error as NSDAError).message).toBe('The NSDA API answered GET /search with 500 Internal Server Error: {}');
	});

	it('refuses to call anything when the API is not configured', async () => {
		config.nsda = { ...config.nsda, key: undefined };

		expect(isNSDAConfigured()).toBe(false);
		await expect(fetchNSDA('/learn/courses/117271')).rejects.toThrow('The NSDA API is not configured');
		expect(fetchMock).not.toHaveBeenCalled();

		Object.assign(config.nsda, { key: 'secret' });
		expect(isNSDAConfigured()).toBe(true);
	});
});
