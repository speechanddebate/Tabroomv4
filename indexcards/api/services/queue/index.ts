import { metrics, type BatchObservableCallback, type ObservableCallback } from '@opentelemetry/api';
import { MetricNames, TelemetryAttributes, type Queue } from 'bullmq';
import packageData from '../../../package.json' with { type: 'json' };
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { baseOptions, isRedisDown } from './connection.js';
import type { QueueDefinition } from './define.js';
import { closeFlows } from './flows.js';
import { closeQueues, getQueue } from './queues.js';
import { getDefinition, queueNames } from './registry.js';
import { closeWorkers } from './workers.js';

export { RetryAfterError, retryAfterBackoff } from './backoff.js';
export { defineQueue, type FlowJobOpts, type FlowNode } from './define.js';
export { addFlow } from './flows.js';
export { addJobs, getQueue } from './queues.js';
export { type QueueData, type QueueName, type QueueResult } from './registry.js';
export { startWorkers } from './workers.js';

let stopObserving: (() => void) | undefined;

/**
 * Open every queue and wait for Redis, then set or clear each queue's global concurrency, add
 * or remove its job schedulers as their enabled() says, and remove any its definition no longer
 * lists. Logs instead of throwing so the API still starts without Redis.
 * With telemetry on, also reports each queue's job counts as the bullmq.queue.jobs gauge, which
 * BullMQ only records when asked (recordJobCountsMetric). An observable gauge is read by the SDK at
 * each export, so telemetry.metricsInterval is its only setting. Queues with job schedulers also
 * report tabroom.queue.scheduler.next_run, last_success, last_failure and last_run_duration the same way
 */
export async function startQueues() {
	if (config.telemetry.enabled && !stopObserving) {
		// BullMQOtel keeps its meter private; this is the same-named one, with BullMQ's metric and attribute names
		const gauge = metrics.getMeter('bullmq', packageData.version).createObservableGauge(MetricNames.QueueJobsCount, {
			description: 'Number of jobs in the queue by state',
			unit: '{jobs}',
		});
		const observe: ObservableCallback = async (result) => {
			// Commands sent while Redis is down queue up in the client until it reconnects
			if (isRedisDown()) return;
			await Promise.all(queueNames.map(async (name) => {
				try {
					for (const [state, count] of Object.entries(await getQueue(name).getJobCounts())) {
						result.observe(count, {
							[TelemetryAttributes.QueueName]: name,
							[TelemetryAttributes.QueueJobsState]: state,
						});
					}
				} catch (error) {
					logger.warn(`Failed to count jobs in queue ${name}`, { 'event.name': 'queue.job_counts.exception', error });
				}
			}));
		};
		gauge.addCallback(observe);

		// A counter has no series until its first add, and Prometheus's increase() can't count the jump
		// from no series to 1, so the first job of each kind after a start went uncounted. BullMQ reuses
		// a counter created on its meter first, so starting each at 0 here makes every job an increase
		const bullMeter = baseOptions.telemetry?.meter;
		if (bullMeter) {
			const counters = {
				completed: MetricNames.JobsCompleted,
				failed: MetricNames.JobsFailed,
				delayed: MetricNames.JobsDelayed,
				retried: MetricNames.JobsRetried,
			};
			for (const name of queueNames) {
				const definition: QueueDefinition = getDefinition(name);
				// Jobs are named for their queue (email, push); a scheduler's job carries its own name
				const jobNames = new Set([name, ...definition.schedulers.map((scheduler) => scheduler.job.name)]);
				for (const [state, metric] of Object.entries(counters)) {
					const counter = bullMeter.createCounter(metric, { description: `Number of jobs ${state}`, unit: '1' });
					for (const jobName of jobNames) {
						counter.add(0, {
							[TelemetryAttributes.QueueName]: name,
							[TelemetryAttributes.JobName]: jobName,
							[TelemetryAttributes.JobState]: state,
						});
					}
				}
			}
		}

		// BullMQ's counters only move when a job runs, so a schedule that stopped firing looks like a
		// quiet queue. These say when each scheduler is next due and when its queue last finished a job
		const meter = metrics.getMeter('indexcards');
		const nextRun = meter.createObservableGauge('tabroom.queue.scheduler.next_run', {
			description: 'Unix time a job scheduler next adds its job',
			unit: 's',
		});
		const lastSuccess = meter.createObservableGauge('tabroom.queue.scheduler.last_success', {
			description: 'Unix time a queue with a job scheduler last completed a job',
			unit: 's',
		});
		// BullMQ's failed counter has no series until a queue's first failure after a start, so it misses
		// that one. The time of the newest failure does not, and a failure newer than the last success is a failed run
		const lastFailure = meter.createObservableGauge('tabroom.queue.scheduler.last_failure', {
			description: 'Unix time a queue with a job scheduler last failed a job for good',
			unit: 's',
		});
		// BullMQ's duration histogram can't be started at 0, so it loses the first run after a start too
		const lastRunDuration = meter.createObservableGauge('tabroom.queue.scheduler.last_run_duration', {
			description: 'How long the job a queue with a job scheduler last completed took to run',
			unit: 's',
		});
		const schedulerGauges = [nextRun, lastSuccess, lastFailure, lastRunDuration];
		const observeSchedulers: BatchObservableCallback = async (result) => {
			if (isRedisDown()) return;
			await Promise.all(queueNames.filter((name) => getDefinition(name).schedulers.length).map(async (name) => {
				try {
					const queue: Queue = getQueue(name);
					const [schedulers, [newest], [newestFailed]] = await Promise.all([queue.getJobSchedulers(), queue.getCompleted(0, 0), queue.getFailed(0, 0)]);
					for (const scheduler of schedulers) {
						if (scheduler.next) {
							result.observe(nextRun, scheduler.next / 1000, {
								[TelemetryAttributes.QueueName]: name,
								'tabroom.queue.scheduler.id': scheduler.key,
							});
						}
					}
					// A queue whose schedulers are all switched off reports nothing, so nothing reads as overdue
					if (schedulers.length && newest?.finishedOn) {
						result.observe(lastSuccess, newest.finishedOn / 1000, { [TelemetryAttributes.QueueName]: name });
						if (newest.processedOn) {
							result.observe(lastRunDuration, (newest.finishedOn - newest.processedOn) / 1000, { [TelemetryAttributes.QueueName]: name });
						}
					}
					if (schedulers.length && newestFailed?.finishedOn) {
						result.observe(lastFailure, newestFailed.finishedOn / 1000, { [TelemetryAttributes.QueueName]: name });
					}
				} catch (error) {
					logger.warn(`Failed to read job schedulers on queue ${name}`, { 'event.name': 'queue.scheduler_times.exception', error });
				}
			}));
		};
		meter.addBatchObservableCallback(observeSchedulers, schedulerGauges);

		// Removed on stop so an export during shutdown can't reopen a closed queue through getQueue
		stopObserving = () => {
			gauge.removeCallback(observe);
			meter.removeBatchObservableCallback(observeSchedulers, schedulerGauges);
		};
	}

	try {
		// The client keeps reconnecting while Redis is down, so stop waiting for it after a few seconds
		await Promise.race([
			Promise.all(queueNames.map((name) => getQueue(name).waitUntilReady())),
			new Promise((_resolve, reject) => {
				setTimeout(() => reject(new Error('Timed out waiting for Redis')), 5000).unref();
			}),
		]);
		logger.info(`Connected job queues to Redis at ${new URL(config.redis.url).host}`);

		await Promise.all(queueNames.map(async (name) => {
			// Each scheduler's job was typed against its queue in defineQueue, so both are widened here
			const definition: QueueDefinition = getDefinition(name);
			const queue: Queue = getQueue(name);

			// The cap lives in Redis, so dropping it from a definition has to remove it there too
			try {
				if (definition.globalConcurrency) {
					await queue.setGlobalConcurrency(definition.globalConcurrency);
				} else {
					await queue.removeGlobalConcurrency();
				}
			} catch (error) {
				logger.error(`Failed to update global concurrency on queue ${name}`, { 'event.name': 'queue.concurrency.exception', error });
			}

			// Timers follow their flags: an enabled one is added or updated, a disabled one removed
			await Promise.all(definition.schedulers.map(async (scheduler) => {
				try {
					if (scheduler.enabled()) {
						// A scheduler's jobs take their options from its template, not from the queue's defaults
						await queue.upsertJobScheduler(scheduler.id, scheduler.repeat, { ...scheduler.job, opts: definition.jobOptions });
					} else {
						await queue.removeJobScheduler(scheduler.id);
					}
				} catch (error) {
					logger.error(`Failed to update job scheduler ${scheduler.id} on queue ${name}`, { 'event.name': 'queue.scheduler.exception', error });
				}
			}));

			// One renamed or deleted in code is still in Redis and would keep adding jobs
			try {
				const listed = new Set(definition.schedulers.map((scheduler) => scheduler.id));
				const stale = (await queue.getJobSchedulers()).filter((scheduler) => !listed.has(scheduler.key));
				await Promise.all(stale.map((scheduler) => queue.removeJobScheduler(scheduler.key)));
				if (stale.length) {
					logger.info(`Removed job schedulers no longer defined on queue ${name}: ${stale.map((scheduler) => scheduler.key).join(', ')}`, { 'event.name': 'queue.scheduler.stale_removed' });
				}
			} catch (error) {
				logger.error(`Failed to remove stale job schedulers on queue ${name}`, { 'event.name': 'queue.scheduler.exception', error });
			}
		}));
	} catch (error) {
		logger.error(`Failed to connect job queues to Redis at ${new URL(config.redis.url).host}`, {
			'event.name': 'queue.connect.exception',
			error,
		});
	}
}

/** Close the workers, then the queues and flow producer and their Redis connections */
export async function stopQueues() {
	stopObserving?.();
	stopObserving = undefined;
	await closeWorkers();
	await Promise.all([closeQueues(), closeFlows()]);
}
