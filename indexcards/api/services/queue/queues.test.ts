import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ENQUEUE_TIMEOUT, addJobs, closeQueues } from './queues.js';

// Every Queue the module opens shares these spies, so a test can make addBulk hang or fail
const { addBulk, redisDown } = vi.hoisted(() => ({
	addBulk: vi.fn(),
	redisDown: { value: false },
}));
vi.mock('bullmq', async (importOriginal) => ({
	...await importOriginal<typeof import('bullmq')>(),
	Queue: class {
		on() { return this; }
		addBulk = addBulk;
		async close() {}
	},
}));
vi.mock('./connection.js', () => ({
	baseOptions: {},
	isRedisDown: () => redisDown.value,
}));
vi.mock('./registry.js', () => ({
	getDefinition: () => ({ jobOptions: {} }),
}));

const node = (queueName: string, id: number) => ({ queueName, name: 'thing', data: { id }, opts: { jobId: `thing-${id}` } });

describe('addJobs', () => {
	beforeEach(() => {
		redisDown.value = false;
		addBulk.mockReset().mockResolvedValue([]);
	});

	afterEach(async () => {
		vi.useRealTimers();
		await closeQueues();
	});

	it('adds each queue its own jobs in one call', async () => {
		await addJobs([node('email', 1), node('push', 1), node('email', 2)]);

		expect(addBulk).toHaveBeenCalledTimes(2);
		expect(addBulk).toHaveBeenCalledWith([
			{ name: 'thing', data: { id: 1 }, opts: { jobId: 'thing-1' } },
			{ name: 'thing', data: { id: 2 }, opts: { jobId: 'thing-2' } },
		]);
		expect(addBulk).toHaveBeenCalledWith([{ name: 'thing', data: { id: 1 }, opts: { jobId: 'thing-1' } }]);
	});

	it('touches no queue with nothing to add', async () => {
		await addJobs([]);

		expect(addBulk).not.toHaveBeenCalled();
	});

	it('throws straight away while Redis is down instead of holding the jobs for a reconnect', async () => {
		redisDown.value = true;

		await expect(addJobs([node('email', 1)])).rejects.toThrow('not connected to Redis');
		expect(addBulk).not.toHaveBeenCalled();
	});

	it('gives up when Redis does not answer in time', async () => {
		vi.useFakeTimers();
		addBulk.mockReturnValue(new Promise(() => undefined));

		// Caught as it happens, so the rejection has a handler before the timer fires
		const adding = addJobs([node('email', 1)]).catch((error: Error) => error);
		await vi.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT);

		expect(await adding).toMatchObject({ message: `Timed out after ${ENQUEUE_TIMEOUT}ms adding 1 job(s)` });
	});

	it('passes a failed add through', async () => {
		addBulk.mockRejectedValue(new Error('READONLY You can\'t write against a read only replica'));

		await expect(addJobs([node('email', 1)])).rejects.toThrow('READONLY');
	});
});
