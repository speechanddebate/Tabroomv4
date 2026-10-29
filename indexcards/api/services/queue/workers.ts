import { UnrecoverableError, Worker, type Processor } from 'bullmq';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { processEmail, processNotify, processPush } from '../notifications/jobs.js';
import { baseOptions, isRedisDown } from './connection.js';
import type { QueueData, QueueName } from './queues.js';

type WorkerSettings<N extends QueueName> = {
	processor: Processor<QueueData[N]>,
	/** Jobs one worker runs at the same time */
	concurrency: number,
};

/** What processes each queue's jobs */
const settings: { [N in QueueName]: WorkerSettings<N> } = {
	notify: { processor: processNotify, concurrency: 2 },
	email: { processor: processEmail, concurrency: 10 },
	push: { processor: processPush, concurrency: 10 },
};

const workers: Worker[] = [];

// Generic per queue so each processor keeps its own job data type
function startWorker<N extends QueueName>(name: N) {
	const { processor, concurrency } = settings[name];
	const worker = new Worker<QueueData[N]>(name, processor, { ...baseOptions, concurrency });

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

/** Start config.queue.workers workers for every queue */
export function startWorkers() {
	for (const name of Object.keys(settings) as QueueName[]) {
		for (let i = 0; i < config.queue.workers; i++) {
			startWorker(name);
		}
	}

	if (workers.length > 0) {
		logger.info(`Started ${config.queue.workers} worker(s) for each job queue`);
	}
}

/** Close every worker, letting jobs in progress finish first */
export async function closeWorkers() {
	const open = workers.splice(0);
	await Promise.all(open.map((worker) => worker.close()));
}
