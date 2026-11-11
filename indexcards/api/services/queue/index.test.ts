import type { BatchObservableCallback, BatchObservableResult, ObservableCallback, ObservableResult } from '@opentelemetry/api';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { startQueues, stopQueues } from './index.js';

const { gauge, batch, getJobCounts, getCompleted, getFailed, redisDown, schedulers, globalConcurrency, jobOptions, upsertJobScheduler, removeJobScheduler, getJobSchedulers, setGlobalConcurrency, removeGlobalConcurrency, waitUntilReady } = vi.hoisted(() => {
	const callbacks = new Set<ObservableCallback>();
	return {
		gauge: {
			callbacks,
			create: vi.fn(),
			addCallback: (callback: ObservableCallback) => { callbacks.add(callback); },
			removeCallback: (callback: ObservableCallback) => { callbacks.delete(callback); },
		},
		batch: { callbacks: new Set<BatchObservableCallback>(), create: vi.fn() },
		getJobCounts: vi.fn(),
		getCompleted: vi.fn(),
		getFailed: vi.fn(),
		redisDown: { value: false },
		/** each queue's job schedulers, as its definition lists them */
		schedulers: {} as Record<string, { id: string; repeat: object; job: object; enabled: () => boolean }[]>,
		/** each queue's global concurrency, as its definition sets it */
		globalConcurrency: {} as Record<string, number>,
		/** the options every queue's definition gives its jobs */
		jobOptions: { attempts: 3, removeOnComplete: { count: 100 } },
		upsertJobScheduler: vi.fn(),
		removeJobScheduler: vi.fn(),
		/** the schedulers Redis holds for a queue, whatever its definition says */
		getJobSchedulers: vi.fn(),
		setGlobalConcurrency: vi.fn(),
		removeGlobalConcurrency: vi.fn(),
		waitUntilReady: vi.fn(async () => undefined),
	};
});
vi.mock('@opentelemetry/api', async (importOriginal) => ({
	...await importOriginal<typeof import('@opentelemetry/api')>(),
	metrics: {
		getMeter: (meter: string) => (meter === 'bullmq'
			? {
				createObservableGauge: (...args: unknown[]) => {
					gauge.create(...args);
					return gauge;
				},
			}
			: {
				// The scheduler gauges stand in as their own names, which is what a batch result is observed against
				createObservableGauge: (name: string, options: object) => {
					batch.create(name, options);
					return name;
				},
				addBatchObservableCallback: (callback: BatchObservableCallback) => { batch.callbacks.add(callback); },
				removeBatchObservableCallback: (callback: BatchObservableCallback) => { batch.callbacks.delete(callback); },
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
		getJobSchedulers = () => getJobSchedulers(this.name);
		getCompleted = (...args: unknown[]) => getCompleted(this.name, ...args);
		getFailed = (...args: unknown[]) => getFailed(this.name, ...args);
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
	getDefinition: (name: string) => ({ jobOptions, globalConcurrency: globalConcurrency[name], schedulers: schedulers[name] ?? [] }),
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
		getJobSchedulers.mockReset().mockResolvedValue([]);
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

describe('startQueues scheduler gauges', () => {
	const telemetry = { ...config.telemetry };
	const sweep = { id: 'push:sweep', repeat: { every: 5_000 }, job: { name: 'sweep', data: {} }, enabled: () => true };

	/** Runs the batch callback the way the SDK does at export, and returns what it observed by gauge name */
	async function collectSchedulers() {
		const observed: Array<[string, number, Record<string, unknown>]> = [];
		const result = { observe: (metric: unknown, value: number, attributes = {}) => { observed.push([metric as string, value, attributes]); } } as BatchObservableResult;
		for (const callback of batch.callbacks) {
			await callback(result);
		}
		return observed;
	}

	beforeAll(() => {
		Object.assign(config.telemetry, { enabled: true });
	});

	afterAll(() => {
		Object.assign(config.telemetry, telemetry);
	});

	beforeEach(() => {
		redisDown.value = false;
		batch.create.mockClear();
		getJobCounts.mockReset().mockResolvedValue({});
		upsertJobScheduler.mockReset().mockResolvedValue(undefined);
		// Only push has a scheduler, so a call for email would show up as an observation
		schedulers.push = [sweep];
		getJobSchedulers.mockReset().mockResolvedValue([{ key: 'push:sweep', next: 1_800_000_000_000 }]);
		getCompleted.mockReset().mockResolvedValue([{ finishedOn: 1_799_999_000_500 }]);
		getFailed.mockReset().mockResolvedValue([]);
	});

	afterEach(async () => {
		await stopQueues();
		delete schedulers.push;
	});

	it('reports when each scheduler is next due and when its queue last completed a job, in seconds', async () => {
		await startQueues();

		expect(batch.create).toHaveBeenCalledWith('tabroom.queue.scheduler.next_run', expect.objectContaining({ unit: 's' }));
		expect(batch.create).toHaveBeenCalledWith('tabroom.queue.scheduler.last_success', expect.objectContaining({ unit: 's' }));
		expect(await collectSchedulers()).toEqual([
			['tabroom.queue.scheduler.next_run', 1_800_000_000, { 'bullmq.queue.name': 'push', 'tabroom.queue.scheduler.id': 'push:sweep' }],
			['tabroom.queue.scheduler.last_success', 1_799_999_000.5, { 'bullmq.queue.name': 'push' }],
		]);
		expect(getCompleted).toHaveBeenCalledExactlyOnceWith('push', 0, 0);
	});

	it('reports when its queue last failed a job for good, once one has', async () => {
		getFailed.mockResolvedValue([{ finishedOn: 1_799_999_500_000 }]);
		await startQueues();

		expect(batch.create).toHaveBeenCalledWith('tabroom.queue.scheduler.last_failure', expect.objectContaining({ unit: 's' }));
		expect(await collectSchedulers()).toContainEqual(['tabroom.queue.scheduler.last_failure', 1_799_999_500, { 'bullmq.queue.name': 'push' }]);
		expect(getFailed).toHaveBeenCalledExactlyOnceWith('push', 0, 0);
	});

	it('reports how long the last completed job ran, from when a worker took it', async () => {
		getCompleted.mockResolvedValue([{ processedOn: 1_799_999_000_250, finishedOn: 1_799_999_000_500 }]);
		await startQueues();

		expect(batch.create).toHaveBeenCalledWith('tabroom.queue.scheduler.last_run_duration', expect.objectContaining({ unit: 's' }));
		expect(await collectSchedulers()).toContainEqual(['tabroom.queue.scheduler.last_run_duration', 0.25, { 'bullmq.queue.name': 'push' }]);
	});

	it('reports no last success before the first run completes', async () => {
		getCompleted.mockResolvedValue([]);
		await startQueues();

		expect(await collectSchedulers()).toEqual([
			['tabroom.queue.scheduler.next_run', 1_800_000_000, expect.anything()],
		]);
	});

	it('reports nothing for a queue whose schedulers are switched off', async () => {
		getJobSchedulers.mockResolvedValue([]);
		await startQueues();

		expect(await collectSchedulers()).toEqual([]);
	});

	it('reports nothing while Redis is down', async () => {
		await startQueues();
		getJobSchedulers.mockClear();
		redisDown.value = true;

		expect(await collectSchedulers()).toEqual([]);
		expect(getJobSchedulers).not.toHaveBeenCalled();
	});

	it('logs a queue it cannot read', async () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
		await startQueues();
		getCompleted.mockRejectedValue(new Error('boom'));

		expect(await collectSchedulers()).toEqual([]);
		expect(warn).toHaveBeenCalledWith('Failed to read job schedulers on queue push', {
			'event.name': 'queue.scheduler_times.exception',
			error: expect.any(Error),
		});
		warn.mockRestore();
	});

	it('registers once however often the queues start, and stops when they stop', async () => {
		await startQueues();
		await startQueues();

		expect(batch.callbacks.size).toBe(1);

		await stopQueues();

		expect(batch.callbacks.size).toBe(0);
	});
});

describe('startQueues queue settings', () => {
	const sweep = { id: 'push:sweep', repeat: { every: 5_000 }, job: { name: 'sweep', data: {} } };

	beforeEach(() => {
		redisDown.value = false;
		getJobCounts.mockReset().mockResolvedValue({});
		upsertJobScheduler.mockReset().mockResolvedValue(undefined);
		removeJobScheduler.mockReset().mockResolvedValue(true);
		getJobSchedulers.mockReset().mockResolvedValue([]);
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

	it('adds an enabled scheduler with its interval, its job, and the queue job options', async () => {
		schedulers.push = [{ ...sweep, enabled: () => true }];

		await startQueues();

		expect(upsertJobScheduler).toHaveBeenCalledExactlyOnceWith('push', 'push:sweep', { every: 5_000 }, { name: 'sweep', data: {}, opts: jobOptions });
		expect(removeJobScheduler).not.toHaveBeenCalled();
	});

	it('adds a cron scheduler with its pattern and time zone', async () => {
		schedulers.push = [{ ...sweep, id: 'push:nightly', repeat: { pattern: '15 9 * * *', tz: 'America/Chicago' }, enabled: () => true }];

		await startQueues();

		expect(upsertJobScheduler).toHaveBeenCalledExactlyOnceWith('push', 'push:nightly', { pattern: '15 9 * * *', tz: 'America/Chicago' }, expect.objectContaining({ opts: jobOptions }));
	});

	it('removes schedulers Redis still holds that the queue no longer defines', async () => {
		schedulers.push = [{ ...sweep, enabled: () => true }];
		getJobSchedulers.mockImplementation(async (name: string) => (
			name === 'push' ? [{ key: 'push:sweep' }, { key: 'push:renamed' }] : [{ key: 'email:deleted' }]
		));
		const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);

		await startQueues();

		expect(removeJobScheduler.mock.calls).toEqual(expect.arrayContaining([['push', 'push:renamed'], ['email', 'email:deleted']]));
		expect(removeJobScheduler).toHaveBeenCalledTimes(2);
		expect(info).toHaveBeenCalledWith('Removed job schedulers no longer defined on queue push: push:renamed', { 'event.name': 'queue.scheduler.stale_removed' });
		info.mockRestore();
	});

	it('logs a failure to list stale schedulers and still sets up the other queues', async () => {
		schedulers.push = [{ ...sweep, enabled: () => true }];
		getJobSchedulers.mockImplementation(async (name: string) => {
			if (name === 'email') throw new Error('NOSCRIPT');
			return [];
		});
		const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);

		await expect(startQueues()).resolves.toBeUndefined();

		expect(error).toHaveBeenCalledWith('Failed to remove stale job schedulers on queue email', expect.objectContaining({ 'event.name': 'queue.scheduler.exception' }));
		expect(upsertJobScheduler).toHaveBeenCalledWith('push', 'push:sweep', expect.anything(), expect.anything());
		error.mockRestore();
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
