import { db } from '../../data/database.js';
import messageRepo from '../../repos/messageRepo.js';
import { retryAfterBackoff } from '../queue/backoff.js';
import { defineQueue } from '../queue/define.js';
import { processEmail, processPush } from './jobs.js';

/** Emails one person a notification */
export const emailQueue = defineQueue({
	name: 'email',
	processor: processEmail,
	concurrency: 10,
	attempts: 8,
	onFailed: async (job) => {
		await messageRepo.recordDelivery(db, job.data.message, 'email', 'failed');
	},
});

/** Pushes one message to its person's subscribed logins */
export const pushQueue = defineQueue({
	name: 'push',
	processor: processPush,
	concurrency: 10,
	// Push services answer 429 and 503 with Retry-After, which the job passes on in RetryAfterError
	backoffStrategy: retryAfterBackoff,
	onFailed: async (job) => {
		await messageRepo.recordDelivery(db, job.data.message, 'push', job.data.sent?.length ? 'sent' : 'failed');
	},
});
