import { Queue } from 'bullmq';
import logger from '../../helpers/logger.js';
import { baseOptions, isRedisDown } from './connection.js';
import type { FlowNode } from './define.js';
import { getDefinition, type QueueData, type QueueName, type QueueResult } from './registry.js';

const queues = new Map<QueueName, Queue>();

/** Get a queue, connecting it on first use */
export function getQueue<N extends QueueName>(name: N): Queue<QueueData[N], QueueResult[N]> {
	let queue = queues.get(name);
	if (!queue) {
		queue = new Queue(name, {
			...baseOptions,
			defaultJobOptions: getDefinition(name).jobOptions,
		});
		// Without a listener BullMQ prints every error to the console
		queue.on('error', (error) => {
			if (!isRedisDown()) {
				logger.error(`Job queue ${name} error`, { 'event.name': 'queue.exception', error });
			}
		});
		queues.set(name, queue);
	}
	return queue as Queue<QueueData[N], QueueResult[N]>;
}

/** How long addJobs waits for Redis to take the jobs before giving up, in ms */
export const ENQUEUE_TIMEOUT = 10_000;

/**
 * Adds jobs built by queue definitions' job(), each to its own queue, one round trip per
 * queue. For jobs that need nothing to run after them; otherwise put them in a flow.
 * Throws rather than waits when Redis is down: the client would hold the commands until
 * it reconnects, and the request that asked for the jobs needs an answer
 */
export async function addJobs(nodes: FlowNode[]) {
	if (nodes.length === 0) return;
	if (isRedisDown()) throw new Error('Job queues are not connected to Redis');

	const byQueue = new Map<string, FlowNode[]>();
	for (const node of nodes) {
		byQueue.set(node.queueName, [...(byQueue.get(node.queueName) ?? []), node]);
	}
	const adds = Promise.all([...byQueue].map(([queueName, jobs]) => {
		// A node's data was typed against its queue when the definition's job() built it
		const queue: Queue = getQueue(queueName as QueueName);
		return queue.addBulk(jobs.map(({ name, data, opts }) => ({ name, data, opts })));
	}));

	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(`Timed out after ${ENQUEUE_TIMEOUT}ms adding ${nodes.length} job(s)`)), ENQUEUE_TIMEOUT);
		timer.unref();
	});
	try {
		await Promise.race([adds, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/** Close every queue that has been opened */
export async function closeQueues() {
	const open = [...queues.values()];
	queues.clear();
	await Promise.all(open.map((queue) => queue.close()));
}
