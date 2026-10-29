import { UnrecoverableError, Worker } from 'bullmq';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { baseOptions, isRedisDown } from './connection.js';
import type { QueueDefinition } from './define.js';
import { queueDefinitions } from './registry.js';

const workers: Worker[] = [];

function startWorker({ name, processor, concurrency, backoffStrategy }: QueueDefinition) {
	const worker = new Worker(name, processor, {
		...baseOptions,
		concurrency,
		// Only queues defined with a strategy add their jobs with backoff type custom
		...(backoffStrategy ? { settings: { backoffStrategy } } : {}),
	});

	// Without a listener BullMQ prints every error to the console
	worker.on('error', (error) => {
		if (!isRedisDown()) {
			logger.error(`Job worker ${name} error`, error);
		}
	});
	worker.on('failed', (job, error) => {
		const attempts = job?.opts.attempts ?? 1;
		const final = error instanceof UnrecoverableError || (job?.attemptsMade ?? 0) >= attempts;
		const outcome = final ? 'giving up' : 'will retry';
		logger.warn(`Job ${name}:${job?.id} (${job?.name}) failed on attempt ${job?.attemptsMade} of ${attempts}, ${outcome}`, error);
	});

	workers.push(worker);
}

/** Start one worker for every queue, unless config.queue.runWorkers leaves the jobs to another process */
export function startWorkers() {
	if (!config.queue.runWorkers) {
		logger.info('Not running job workers in this process');
		return;
	}

	for (const definition of queueDefinitions) {
		startWorker(definition);
	}
	logger.info(`Started a worker for each job queue: ${queueDefinitions.map((definition) => definition.name).join(', ')}`);
}

/** Close every worker, letting jobs in progress finish first */
export async function closeWorkers() {
	const open = workers.splice(0);
	await Promise.all(open.map((worker) => worker.close()));
}
