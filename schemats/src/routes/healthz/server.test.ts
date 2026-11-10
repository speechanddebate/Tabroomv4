import { GET } from './+server';

vi.mock('$app/env', () => ({ version: 'abc1234' }));

describe('GET /healthz', () => {
	it('returns 200 and the build commit without calling upstream', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const response = await GET({} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok', commit: 'abc1234' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
