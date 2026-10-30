import { retryAfterBackoff } from '../queue/backoff.js';
import { defineQueue } from '../queue/define.js';
import { processEmail, processPush } from './jobs.js';

/** Emails one person a notification */
export const emailQueue = defineQueue({
	name: 'email',
	processor: processEmail,
	concurrency: 10,
	// The default exponential backoff: a relay says "try later" with a 4xx reply but never says when
});

/** Pushes one message to its person's subscribed logins */
export const pushQueue = defineQueue({
	name: 'push',
	processor: processPush,
	concurrency: 10,
	// Push services answer 429 and 503 with Retry-After, which the job passes on in RetryAfterError
	backoffStrategy: retryAfterBackoff,
});
