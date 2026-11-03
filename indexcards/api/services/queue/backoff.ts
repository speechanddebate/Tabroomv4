import type { BackoffStrategy } from 'bullmq';

// Custom backoff strategy for BullMQ that respects Retry-After headers and exponential delays

/** Milliseconds before the first retry; each retry after that waits twice as long */
export const RETRY_DELAY = 10000;

/** Longest a Retry-After is honored, in seconds. Anything a job sends goes stale long before that */
export const MAX_RETRY_AFTER = 60 * 60;

/**
 * Thrown by a job to have BullMQ try it again. retryAfter carries how long the service
 * it was talking to asked us to wait, in seconds, when it said
 */
export class RetryAfterError extends Error {
	constructor(message: string, readonly retryAfter?: number) {
		super(message);
		this.name = 'RetryAfterError';
	}
}

/**
 * The exponential delay, or the Retry-After on the error when that is longer. Every queue
 * uses this through backoff type 'custom', so a job can throw RetryAfterError or any
 * other error and get a sensible wait either way
 */
export const retryAfterBackoff: BackoffStrategy = (attemptsMade, _type, err) => {
	const exponential = Math.round(2 ** (attemptsMade - 1) * RETRY_DELAY);
	const retryAfter = err instanceof RetryAfterError && err.retryAfter !== undefined
		? Math.min(err.retryAfter, MAX_RETRY_AFTER) * 1000
		: 0;
	return Math.max(exponential, retryAfter);
};
