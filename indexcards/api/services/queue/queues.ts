import { Queue } from 'bullmq';
import logger from '../../helpers/logger.js';
import { baseOptions, isRedisDown } from './connection.js';

/** The data each queue's jobs carry. Ids only; the job loads the rest from the database */
export type QueueData = {
	/** Fans a notification out to its recipients, then records the results */
	// TODO: carry only the notify row id once that table exists
	notify: { ids: number[] },
	/** Emails one person a notification */
	email: { notify: number, person: number },
	/** Sends one person a notification on each of their push subscriptions */
	push: { notify: number, person: number },
};

export type QueueName = keyof QueueData;

export const queueNames = ['notify', 'email', 'push'] as const satisfies readonly QueueName[];

const queues = new Map<QueueName, Queue>();

/** Get a queue, connecting it on first use */
export function getQueue<N extends QueueName>(name: N): Queue<QueueData[N]> {
	let queue = queues.get(name);
	if (!queue) {
		queue = new Queue(name, {
			...baseOptions,
			defaultJobOptions: {
				attempts: 3,
				backoff: { type: 'exponential', delay: 10000 },
				// Redis runs with noeviction, so finished jobs have to be cleaned up or they fill it
				removeOnComplete: { age: 24 * 60 * 60 },
				removeOnFail: { age: 7 * 24 * 60 * 60 },
			},
		});
		// Without a listener BullMQ prints every error to the console
		queue.on('error', (error) => {
			if (!isRedisDown()) {
				logger.error(`Job queue ${name} error`, error);
			}
		});
		queues.set(name, queue);
	}
	return queue as Queue<QueueData[N]>;
}

/** Close every queue that has been opened */
export async function closeQueues() {
	const open = [...queues.values()];
	queues.clear();
	await Promise.all(open.map((queue) => queue.close()));
}
