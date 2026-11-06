import { metrics, type ObservableCallback } from '@opentelemetry/api';
import { MetricNames, TelemetryAttributes, type Queue } from 'bullmq';
import packageData from '../../../package.json' with { type: 'json' };
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { isRedisDown } from './connection.js';
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

let stopObservingJobCounts: (() => void) | undefined;

/**
 * Open every queue and wait for Redis, then set or clear each queue's global concurrency and add
 * or remove its job schedulers as their enabled() says. Logs instead of throwing so the API still starts without Redis.
 * With telemetry on, also reports each queue's job counts as the bullmq.queue.jobs gauge, which
 * BullMQ only records when asked (recordJobCountsMetric). An observable gauge is read by the SDK at
 * each export, so telemetry.metricsInterval is its only setting
 */
export async function startQueues() {
	if (config.telemetry.enabled && !stopObservingJobCounts) {
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
		// Removed on stop so an export during shutdown can't reopen a closed queue through getQueue
		stopObservingJobCounts = () => gauge.removeCallback(observe);
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
			const definition = getDefinition(name);
			// A scheduler's job was typed against its queue in defineQueue
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
						await queue.upsertJobScheduler(scheduler.id, { every: scheduler.every }, scheduler.job);
					} else {
						await queue.removeJobScheduler(scheduler.id);
					}
				} catch (error) {
					logger.error(`Failed to update job scheduler ${scheduler.id} on queue ${name}`, { 'event.name': 'queue.scheduler.exception', error });
				}
			}));
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
	stopObservingJobCounts?.();
	stopObservingJobCounts = undefined;
	await closeWorkers();
	await Promise.all([closeQueues(), closeFlows()]);
}
