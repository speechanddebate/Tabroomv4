import type { ObservableCallback, ObservableResult } from '@opentelemetry/api';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { startQueues, stopQueues } from './index.js';

const { gauge, getJobCounts, redisDown } = vi.hoisted(() => {
	const callbacks = new Set<ObservableCallback>();
	return {
		gauge: {
			callbacks,
			create: vi.fn(),
			addCallback: (callback: ObservableCallback) => { callbacks.add(callback); },
			removeCallback: (callback: ObservableCallback) => { callbacks.delete(callback); },
		},
		getJobCounts: vi.fn(),
		redisDown: { value: false },
	};
});
vi.mock('@opentelemetry/api', async (importOriginal) => ({
	...await importOriginal<typeof import('@opentelemetry/api')>(),
	metrics: {
		getMeter: () => ({
			createObservableGauge: (...args: unknown[]) => {
				gauge.create(...args);
				return gauge;
			},
		}),
	},
}));
vi.mock('bullmq', async (importOriginal) => ({
	...await importOriginal<typeof import('bullmq')>(),
	Queue: class {
		name: string;
		constructor(name: string) { this.name = name; }
		on() { return this; }
		async waitUntilReady() {}
		getJobCounts = () => getJobCounts(this.name);
		async close() {}
	},
}));
vi.mock('./connection.js', () => ({
	baseOptions: {},
	isRedisDown: () => redisDown.value,
}));
vi.mock('./registry.js', () => ({
	queueNames: ['email', 'push'],
	getDefinition: () => ({ jobOptions: {} }),
}));
vi.mock('./workers.js', () => ({ closeWorkers: async () => undefined, startWorkers: () => undefined }));
vi.mock('./flows.js', () => ({ closeFlows: async () => undefined, addFlow: async () => undefined }));

/** Runs every registered callback the way the SDK does at export, and returns what they observed */
async function collect() {
	const observed: Array<[number, Record<string, unknown>]> = [];
	const result = { observe: (value: number, attributes = {}) => { observed.push([value, attributes]); } } as ObservableResult;
	for (const callback of gauge.callbacks) {
		await callback(result);
	}
	return observed;
}

describe('startQueues job counts gauge', () => {
	const telemetry = { ...config.telemetry };

	beforeAll(() => {
		Object.assign(config.telemetry, { enabled: true });
	});

	afterAll(() => {
		Object.assign(config.telemetry, telemetry);
	});

	beforeEach(() => {
		redisDown.value = false;
		gauge.create.mockClear();
		getJobCounts.mockReset().mockImplementation(async (name: string) => (
			name === 'email' ? { waiting: 3, active: 1 } : { waiting: 0, active: 0 }
		));
	});

	afterEach(async () => {
		await stopQueues();
	});

	it('reports each queue by state under BullMQ metric and attribute names', async () => {
		await startQueues();

		expect(gauge.create).toHaveBeenCalledWith('bullmq.queue.jobs', expect.objectContaining({ unit: '{jobs}' }));
		expect(await collect()).toEqual(expect.arrayContaining([
			[3, { 'bullmq.queue.name': 'email', 'bullmq.queue.jobs.state': 'waiting' }],
			[1, { 'bullmq.queue.name': 'email', 'bullmq.queue.jobs.state': 'active' }],
			[0, { 'bullmq.queue.name': 'push', 'bullmq.queue.jobs.state': 'waiting' }],
		]));
	});

	it('registers once however often the queues start', async () => {
		await startQueues();
		await startQueues();

		expect(gauge.create).toHaveBeenCalledTimes(1);
		expect(gauge.callbacks.size).toBe(1);
	});

	it('reports nothing while Redis is down', async () => {
		await startQueues();
		redisDown.value = true;

		expect(await collect()).toEqual([]);
		expect(getJobCounts).not.toHaveBeenCalled();
	});

	it('still reports the other queues when one fails', async () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
		getJobCounts.mockImplementation(async (name: string) => {
			if (name === 'email') throw new Error('boom');
			return { waiting: 2 };
		});
		await startQueues();

		expect(await collect()).toEqual([[2, { 'bullmq.queue.name': 'push', 'bullmq.queue.jobs.state': 'waiting' }]]);
		expect(warn).toHaveBeenCalledWith('Failed to count jobs in queue email', {
			'event.name': 'queue.job_counts.exception',
			error: expect.any(Error),
		});
		warn.mockRestore();
	});

	it('stops reporting once the queues stop', async () => {
		await startQueues();
		await stopQueues();

		expect(gauge.callbacks.size).toBe(0);
	});

	it('registers nothing with telemetry off', async () => {
		config.telemetry.enabled = false;
		await startQueues();
		config.telemetry.enabled = true;

		expect(gauge.create).not.toHaveBeenCalled();
	});
});
