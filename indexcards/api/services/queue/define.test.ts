import { describe, it, expect } from 'vitest';
import { RETRY_DELAY, retryAfterBackoff } from './backoff.js';
import { defineQueue } from './define.js';

const processor = async () => undefined;

describe('defineQueue', () => {
	it('fills in the defaults', () => {
		const queue = defineQueue({ name: 'things', processor });

		expect(queue.concurrency).toBe(1);
		expect(queue.backoffStrategy).toBeUndefined();
		expect(queue.jobOptions).toEqual({
			attempts: 3,
			backoff: { type: 'exponential', delay: RETRY_DELAY },
			removeOnComplete: { age: 60 * 60, count: 5000 },
			removeOnFail: { age: 24 * 60 * 60, count: 10000 },
		});
	});

	it('switches to the custom backoff type when given a strategy', () => {
		const queue = defineQueue({ name: 'things', processor, attempts: 5, concurrency: 4, backoffStrategy: retryAfterBackoff });

		expect(queue.concurrency).toBe(4);
		expect(queue.backoffStrategy).toBe(retryAfterBackoff);
		expect(queue.jobOptions).toMatchObject({ attempts: 5, backoff: { type: 'custom' } });
	});

	it('carries a failure hook only when given one', async () => {
		const onFailed = async () => undefined;

		expect(defineQueue({ name: 'things', processor, onFailed }).onFailed).toBe(onFailed);
		expect(defineQueue({ name: 'things', processor })).not.toHaveProperty('onFailed');
	});

	it('carries a global concurrency only when given one', () => {
		expect(defineQueue({ name: 'things', processor, globalConcurrency: 1 }).globalConcurrency).toBe(1);
		expect(defineQueue({ name: 'things', processor })).not.toHaveProperty('globalConcurrency');
	});

	it('carries its job schedulers, none by default', () => {
		const sweep = { id: 'things:sweep', every: 5_000, job: { name: 'sweep', data: {} }, enabled: () => true };

		expect(defineQueue({ name: 'things', processor }).schedulers).toEqual([]);
		expect(defineQueue({ name: 'things', processor, schedulers: [sweep] }).schedulers).toEqual([sweep]);
	});

	it('builds a flow node with the queue options under the job options', () => {
		const queue = defineQueue<'things', { id: number }, void>({ name: 'things', processor });

		expect(queue.job('one', { id: 7 }, { jobId: 'one:7', attempts: 1 })).toEqual({
			queueName: 'things',
			name: 'one',
			data: { id: 7 },
			opts: { ...queue.jobOptions, jobId: 'one:7', attempts: 1 },
		});
		expect(queue.job('one', { id: 7 }).opts).toEqual(queue.jobOptions);
	});
});
