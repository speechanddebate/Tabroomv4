import type { BackoffStrategy, DefaultJobOptions, Processor } from 'bullmq';
import { RETRY_DELAY } from './backoff.js';

/**
 * A queue and the worker that runs its jobs. Features define theirs with defineQueue next
 * to their processors, and registry.ts lists them. Data and Result default to any because
 * the registry holds definitions of every shape; each one is typed where it is defined
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type QueueDefinition<Name extends string = string, Data = any, Result = any> = {
	name: Name;
	processor: Processor<Data, Result>;
	/** Jobs one worker runs at the same time */
	concurrency: number;
	/** Options every job added to the queue gets unless the add says otherwise */
	jobOptions: DefaultJobOptions;
	/** Set when the queue's jobs use backoff type custom */
	backoffStrategy?: BackoffStrategy;
};

export type QueueOptions<Name extends string, Data, Result> = {
	name: Name;
	processor: Processor<Data, Result>;
	/** Jobs one worker runs at the same time. Default 1 */
	concurrency?: number;
	/** Times a job runs before it is failed. Default 3 */
	attempts?: number;
	/**
	 * How long a failed job waits before its next attempt. Default exponential from
	 * RETRY_DELAY. Pass retryAfterBackoff for jobs that throw RetryAfterError
	 */
	backoffStrategy?: BackoffStrategy;
};

/** Fills in the defaults for a queue, so a definition says only what is particular to it */
export function defineQueue<Name extends string, Data, Result>(
	options: QueueOptions<Name, Data, Result>,
): QueueDefinition<Name, Data, Result> {
	const { name, processor, concurrency = 1, attempts = 3, backoffStrategy } = options;
	return {
		name,
		processor,
		concurrency,
		...(backoffStrategy ? { backoffStrategy } : {}),
		jobOptions: {
			attempts,
			backoff: backoffStrategy
				? { type: 'custom' }
				: { type: 'exponential', delay: RETRY_DELAY },
			// Redis runs with noeviction, so finished jobs have to be cleaned up or they fill it
			removeOnComplete: { age: 24 * 60 * 60 },
			removeOnFail: { age: 7 * 24 * 60 * 60 },
		},
	};
}
