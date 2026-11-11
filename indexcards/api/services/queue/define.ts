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
	/** Jobs every worker together runs at the same time, kept in Redis. Unset means no cap */
	globalConcurrency?: number;
	/** Options every job added to the queue gets unless the add says otherwise */
	jobOptions: DefaultJobOptions;
	/** Set when the queue's jobs use backoff type custom */
	backoffStrategy?: BackoffStrategy;
	/** Runs when a job has failed for the last time */
	onFailed?: FailedHook<Data>;
	/** Jobs added on a timer; startQueues keeps them in step with each one's enabled() */
	schedulers: QueueScheduler<Data>[];
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
	/**
	 * Jobs every worker together runs at the same time. 1 runs the queue's jobs strictly one after
	 * another however many API instances run workers. Default no cap
	 */
	globalConcurrency?: number;
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
	/** Jobs to add on a timer, e.g. a sweep every few seconds. Default none */
	schedulers?: QueueScheduler<Data>[];
	/**
	 * Which finished jobs stay in Redis. Default an hour of completed and a day of failed ones.
	 * A scheduled queue keeps by count instead, so a daily job's last run is still there to report
	 */
	removeOnComplete?: DefaultJobOptions['removeOnComplete'];
	removeOnFail?: DefaultJobOptions['removeOnFail'];
};

/**
 * A job BullMQ adds on a timer while enabled() is true. startQueues upserts it when enabled and
 * removes it when not, so turning a feature flag off stops the timer on the next start. One whose
 * id is no longer listed on its queue is removed the same way
 */
export type QueueScheduler<Data> = {
	/** BullMQ's job scheduler id, unique within the queue */
	id: string;
	/** What the job does, for a list of scheduled jobs */
	description?: string;
	/**
	 * When the job is added: every so many ms, or on a cron pattern (five fields, or six with
	 * seconds first) read in a named time zone so no job depends on the server's
	 */
	repeat: { every: number } | { pattern: string; tz: string };
	job: { name: string; data: Data };
	enabled: () => boolean;
};

/** What a queue runs after one of its jobs fails for good */
export type FailedHook<Data> = (job: Job<Data>, error: Error) => Promise<void>;

/** Fills in the defaults for a queue, so a definition says only what is particular to it */
export function defineQueue<Name extends string, Data, Result>(
	options: QueueOptions<Name, Data, Result>,
): QueueDefinition<Name, Data, Result> {
	const {
		name, processor, concurrency = 1, globalConcurrency, attempts = 3, backoffStrategy, onFailed, schedulers = [],
		removeOnComplete = { age: 60 * 60, count: 5000 },
		removeOnFail = { age: 24 * 60 * 60, count: 10000 },
	} = options;
	const jobOptions: DefaultJobOptions = {
		attempts,
		backoff: backoffStrategy
			? { type: 'custom' }
			: { type: 'exponential', delay: RETRY_DELAY },
		removeOnComplete,
		removeOnFail,
	};
	return {
		name,
		processor,
		concurrency,
		...(globalConcurrency ? { globalConcurrency } : {}),
		...(backoffStrategy ? { backoffStrategy } : {}),
		...(onFailed ? { onFailed } : {}),
		schedulers,
		jobOptions,
		job: (jobName, data, opts = {}) => ({
			queueName: name,
			name: jobName,
			data,
			opts: { ...jobOptions, ...opts },
		}),
	};
}
