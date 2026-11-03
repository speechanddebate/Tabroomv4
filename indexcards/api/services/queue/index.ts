import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { closeFlows } from './flows.js';
import { closeQueues, getQueue } from './queues.js';
import { queueNames } from './registry.js';
import { closeWorkers } from './workers.js';

export { RetryAfterError, retryAfterBackoff } from './backoff.js';
export { defineQueue, type FlowJobOpts, type FlowNode } from './define.js';
export { addFlow } from './flows.js';
export { addJobs, getQueue } from './queues.js';
export { type QueueData, type QueueName, type QueueResult } from './registry.js';
export { startWorkers } from './workers.js';

/** Open every queue and wait for Redis. Logs instead of throwing so the API still starts without Redis */
export async function startQueues() {
	try {
		// node-redis retries forever while Redis is down, so stop waiting for it after a few seconds
		await Promise.race([
			Promise.all(queueNames.map((name) => getQueue(name).waitUntilReady())),
			new Promise((_resolve, reject) => {
				setTimeout(() => reject(new Error('Timed out waiting for Redis')), 5000).unref();
			}),
		]);
		logger.info(`Connected job queues to Redis at ${new URL(config.redis.url).host}`);
	} catch (error) {
		logger.error(`Failed to connect job queues to Redis at ${new URL(config.redis.url).host}`, error);
	}
}

/** Close the workers, then the queues and flow producer and their Redis connections */
export async function stopQueues() {
	await closeWorkers();
	await Promise.all([closeQueues(), closeFlows()]);
}
