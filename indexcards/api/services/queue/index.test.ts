import type { ObservableCallback, ObservableResult } from '@opentelemetry/api';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { startQueues, stopQueues } from './index.js';

const { gauge, getJobCounts, redisDown, schedulers, globalConcurrency, upsertJobScheduler, removeJobScheduler, setGlobalConcurrency, removeGlobalConcurrency, waitUntilReady } = vi.hoisted(() => {
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
		/** each queue's job schedulers, as its definition lists them */
		schedulers: {} as Record<string, { id: string; every: number; job: object; enabled: () => boolean }[]>,
		/** each queue's global concurrency, as its definition sets it */
		globalConcurrency: {} as Record<string, number>,
		upsertJobScheduler: vi.fn(),
		removeJobScheduler: vi.fn(),
		setGlobalConcurrency: vi.fn(),
		removeGlobalConcurrency: vi.fn(),
		waitUntilReady: vi.fn(async () => undefined),
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
		waitUntilReady = () => waitUntilReady();
		getJobCounts = () => getJobCounts(this.name);
		upsertJobScheduler = (...args: unknown[]) => upsertJobScheduler(this.name, ...args);
		removeJobScheduler = (...args: unknown[]) => removeJobScheduler(this.name, ...args);
		setGlobalConcurrency = (...args: unknown[]) => setGlobalConcurrency(this.name, ...args);
		removeGlobalConcurrency = () => removeGlobalConcurrency(this.name);
		async close() {}
	},
}));
vi.mock('./connection.js', () => ({
	baseOptions: {},
	isRedisDown: () => redisDown.value,
}));
vi.mock('./registry.js', () => ({
	queueNames: ['email', 'push'],
	getDefinition: (name: string) => ({ jobOptions: {}, globalConcurrency: globalConcurrency[name], schedulers: schedulers[name] ?? [] }),
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

describe('startQueues queue settings', () => {
	const sweep = { id: 'push:sweep', every: 5_000, job: { name: 'sweep', data: {} } };

	beforeEach(() => {
		redisDown.value = false;
		getJobCounts.mockReset().mockResolvedValue({});
		upsertJobScheduler.mockReset().mockResolvedValue(undefined);
		removeJobScheduler.mockReset().mockResolvedValue(true);
		setGlobalConcurrency.mockReset().mockResolvedValue(1);
		removeGlobalConcurrency.mockReset().mockResolvedValue(1);
		waitUntilReady.mockReset().mockResolvedValue(undefined);
		for (const name of Object.keys(schedulers)) delete schedulers[name];
		for (const name of Object.keys(globalConcurrency)) delete globalConcurrency[name];
	});

	afterEach(async () => {
		await stopQueues();
	});

	it('caps a queue that sets a global concurrency and clears the cap on the others', async () => {
		globalConcurrency.push = 1;

		await startQueues();

		expect(setGlobalConcurrency).toHaveBeenCalledExactlyOnceWith('push', 1);
		expect(removeGlobalConcurrency).toHaveBeenCalledExactlyOnceWith('email');
	});

	it('still sets up schedulers when the cap fails', async () => {
		globalConcurrency.push = 1;
		schedulers.push = [{ ...sweep, enabled: () => true }];
		setGlobalConcurrency.mockRejectedValue(new Error('NOSCRIPT'));
		const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);

		await startQueues();

		expect(error).toHaveBeenCalledWith('Failed to update global concurrency on queue push', expect.objectContaining({ 'event.name': 'queue.concurrency.exception' }));
		expect(upsertJobScheduler).toHaveBeenCalledWith('push', 'push:sweep', expect.anything(), expect.anything());
		error.mockRestore();
	});

	it('adds an enabled scheduler with its interval and job', async () => {
		schedulers.push = [{ ...sweep, enabled: () => true }];

		await startQueues();

		expect(upsertJobScheduler).toHaveBeenCalledWith('push', 'push:sweep', { every: 5_000 }, { name: 'sweep', data: {} });
		expect(removeJobScheduler).not.toHaveBeenCalled();
	});

	it('removes a disabled scheduler, so turning its flag off stops it', async () => {
		schedulers.push = [{ ...sweep, enabled: () => false }];

		await startQueues();

		expect(removeJobScheduler).toHaveBeenCalledWith('push', 'push:sweep');
		expect(upsertJobScheduler).not.toHaveBeenCalled();
	});

	it('logs a scheduler that fails and still sets up the others', async () => {
		schedulers.email = [{ ...sweep, id: 'email:sweep', enabled: () => true }];
		schedulers.push = [{ ...sweep, enabled: () => true }];
		upsertJobScheduler.mockImplementation(async (name: string) => {
			if (name === 'email') throw new Error('NOSCRIPT');
		});
		const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);

		await expect(startQueues()).resolves.toBeUndefined();

		expect(upsertJobScheduler).toHaveBeenCalledWith('push', 'push:sweep', expect.anything(), expect.anything());
		expect(error).toHaveBeenCalledWith('Failed to update job scheduler email:sweep on queue email', expect.objectContaining({ 'event.name': 'queue.scheduler.exception' }));
		error.mockRestore();
	});

	it('leaves schedulers alone when Redis never connects', async () => {
		schedulers.push = [{ ...sweep, enabled: () => true }];
		waitUntilReady.mockImplementation(() => new Promise(() => undefined));
		const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);
		vi.useFakeTimers();

		const started = startQueues();
		await vi.advanceTimersByTimeAsync(5_000);
		await started;
		vi.useRealTimers();

		expect(upsertJobScheduler).not.toHaveBeenCalled();
		expect(removeGlobalConcurrency).not.toHaveBeenCalled();
		error.mockRestore();
	});
});
