import type { BackoffStrategy, DefaultJobOptions, Job, JobsOptions, Processor } from 'bullmq';
import { RETRY_DELAY } from './backoff.js';

/** Options a job in a flow may set; its place in the flow comes from where it is passed */
export type FlowJobOpts = Omit<JobsOptions, 'parent' | 'repeat'>;

/** A job ready to go in a flow, with its queue's options filled in */
export type FlowNode = {
	queueName: string;
	name: string;
	data: unknown;
	opts: FlowJobOpts;
};

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
	/** Runs when a job has failed for the last time */
	onFailed?: FailedHook<Data>;
	/**
	 * A job for this queue with the queue's options applied, for addFlow. A flow doesn't
	 * pick up a queue's default options the way Queue.add does, so they go on here
	 */
	job: (name: string, data: Data, opts?: FlowJobOpts) => FlowNode;
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
	/**
	 * Runs when a job has failed for the last time: its attempts are used up or it threw
	 * UnrecoverableError. The worker logs anything it throws, so a hook can't fail the queue
	 */
	onFailed?: FailedHook<Data>;
};

/** What a queue runs after one of its jobs fails for good */
export type FailedHook<Data> = (job: Job<Data>, error: Error) => Promise<void>;

/** Fills in the defaults for a queue, so a definition says only what is particular to it */
export function defineQueue<Name extends string, Data, Result>(
	options: QueueOptions<Name, Data, Result>,
): QueueDefinition<Name, Data, Result> {
	const { name, processor, concurrency = 1, attempts = 3, backoffStrategy, onFailed } = options;
	const jobOptions: DefaultJobOptions = {
		attempts,
		backoff: backoffStrategy
			? { type: 'custom' }
			: { type: 'exponential', delay: RETRY_DELAY },
		// Redis runs with noeviction, so finished jobs have to be cleaned up or they fill it
		removeOnComplete: { age: 24 * 60 * 60 },
		removeOnFail: { age: 7 * 24 * 60 * 60 },
	};
	return {
		name,
		processor,
		concurrency,
		...(backoffStrategy ? { backoffStrategy } : {}),
		...(onFailed ? { onFailed } : {}),
		jobOptions,
		job: (jobName, data, opts = {}) => ({
			queueName: name,
			name: jobName,
			data,
			opts: { ...jobOptions, ...opts },
		}),
	};
}
