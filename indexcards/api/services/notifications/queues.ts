import { retryAfterBackoff } from '../queue/backoff.js';
import { defineQueue } from '../queue/define.js';
import { processEmail, processNotify, processPush } from './jobs.js';

/** Fans a notification out to its recipients, then records the results */
export const notifyQueue = defineQueue({
	name: 'notify',
	processor: processNotify,
	concurrency: 2,
});

/** Emails one person a notification */
export const emailQueue = defineQueue({
	name: 'email',
	processor: processEmail,
	concurrency: 10,
});

/** Pushes one message to its person's subscribed logins */
export const pushQueue = defineQueue({
	name: 'push',
	processor: processPush,
	concurrency: 10,
	// Push services answer 429 and 503 with Retry-After, which the job passes on in RetryAfterError
	backoffStrategy: retryAfterBackoff,
});
