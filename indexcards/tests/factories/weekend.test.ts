import { noMs } from './factoryUtils.js';
import weekend from './weekend.js';

describe('weekend factory', () => {
	it('stores a start override without milliseconds, like the deadlines derived from it', async () => {
		const start = new Date('2025-02-01T14:00:00.750Z');

		const row = await weekend.create({ start });

		expect(row.start?.getTime()).toBe(noMs(start).getTime());
		expect(row.reg_end?.getTime()).toBe(noMs(start).getTime() - 7 * 24 * 60 * 60 * 1000);
	});

	it('keeps other overrides', async () => {
		const end = new Date('2025-02-05T14:00:00Z');

		const row = await weekend.create({ name: 'Finals Weekend', end });

		expect(row.name).toBe('Finals Weekend');
		expect(row.end?.getTime()).toBe(end.getTime());
	});
});
