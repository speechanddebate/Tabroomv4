import { UnrecoverableError, type Processor } from 'bullmq';
import logger from '../../helpers/logger.js';
import { RetryAfterError } from '../queue/backoff.js';
import { isPushConfigured, pushMessage, type PushMessageResult } from './channels/webpush.js';

// Job data is ids only; the job loads the rest from the database

// TODO: carry only the notify row id once that table exists
export type NotifyJobData = { ids: number[] };
export type EmailJobData = { notify: number, person: number };
/** sent lists the logins earlier attempts reached */
export type PushJobData = { message: number, sent?: number[] };

// TODO: replace with the fanOut/finalize and sendEmail steps when the BullMQ dispatcher lands.
// Nothing adds email jobs yet; until then a job fails once instead of retrying
function notImplemented(): never {
	throw new UnrecoverableError('Notification jobs are not implemented yet');
}

/** Fans a notification out to email and push jobs, then records the results once they finish */
export const processNotify: Processor<NotifyJobData, void> = async (job) => {
	// TODO: fan out to email and push jobs. For now this only proves the queue is wired up
	for (const person of job.data.ids) {
		logger.info(`Notify job ${job.id} for person ${person}`);
	}
};

/** Emails one person a notification */
export const processEmail: Processor<EmailJobData, void> = async () => notImplemented();

/** What a push job reports when it finishes */
export type PushJobResult = {
	/** Logins that got the message, across every attempt */
	sent: number;
	/** Dead subscriptions that were removed */
	gone: number;
	/** Subscriptions the push service refused */
	rejected: number;
	/** Why nothing was attempted, when nothing was */
	skipped?: PushMessageResult['skipped'];
};

let warnedUnconfigured = false;

/** Pushes one message to its person's subscribed logins, retrying the ones the push service put off */
export const processPush: Processor<PushJobData, PushJobResult> = async (job) => {
	// A worker without keys is an environment choice, so say so once rather than fail every job
	if (!isPushConfigured()) {
		if (!warnedUnconfigured) {
			warnedUnconfigured = true;
			logger.warn('Push jobs are being skipped, web push is not configured on this worker');
		}
		return { sent: 0, gone: 0, rejected: 0, skipped: 'unconfigured' };
	}
	warnedUnconfigured = false;

	const before = job.data.sent ?? [];
	const result = await pushMessage(job.data.message, before);
	const sent = [...before, ...result.sent];

	if (result.retry.sessions.length > 0) {
		// Remembered on the job so the next attempt skips the logins this one reached
		await job.updateData({ ...job.data, sent });
		throw new RetryAfterError(
			`Push for message ${job.data.message} needs another try for ${result.retry.sessions.length} login(s)`,
			result.retry.retryAfter,
		);
	}

	return {
		sent: sent.length,
		gone: result.gone,
		rejected: result.rejected,
		...(result.skipped ? { skipped: result.skipped } : {}),
	};
};
