import { UnrecoverableError, type Processor } from 'bullmq';
import logger from '../../helpers/logger.js';
import type { QueueData } from '../queue/index.js';

// TODO: replace with the fanOut/finalize, sendEmail and sendPush steps when the BullMQ dispatcher lands.
// Nothing adds email or push jobs yet; until then a job fails once instead of retrying
function notImplemented(): never {
	throw new UnrecoverableError('Notification jobs are not implemented yet');
}

/** Fans a notification out to email and push jobs, then records the results once they finish */
export const processNotify: Processor<QueueData['notify']> = async (job) => {
	// TODO: fan out to email and push jobs. For now this only proves the queue is wired up
	for (const person of job.data.ids) {
		logger.info(`Notify job ${job.id} for person ${person}`);
	}
};

/** Emails one person a notification */
export const processEmail: Processor<QueueData['email']> = async () => notImplemented();

/** Sends one person a notification on each of their push subscriptions */
export const processPush: Processor<QueueData['push']> = async () => notImplemented();
