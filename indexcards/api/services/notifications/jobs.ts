import { UnrecoverableError, type Processor } from 'bullmq';
import logger from '../../helpers/logger.js';
import { RetryAfterError } from '../queue/backoff.js';
import { isPushConfigured, pushMessage, type PushMessageResult } from './channels/webpush.js';

// Job data is ids only; the job loads the rest from the database

export type EmailJobData = { message: number };
/** sent lists the logins earlier attempts reached */
export type PushJobData = { message: number, sent?: number[] };

// TODO: replace with the blast email step. Nothing adds email jobs yet; until then a job
// fails once instead of retrying
function notImplemented(): never {
	throw new UnrecoverableError('Notification jobs are not implemented yet');
}

/** What a set of delivery jobs added up to, for whatever runs after them */
export type DeliveryTotals = {
	/** Distinct messages the jobs were for */
	recipients: number;
	push: {
		/** Logins that got the message */
		sent: number;
		/** Dead subscriptions that were removed */
		gone: number;
		/** Subscriptions the push service refused */
		rejected: number;
		/** Jobs that had nothing to send to */
		skipped: number;
		/** Jobs that gave up after their retries */
		failed: number;
	};
};

// A delivery job's key is bull:<queue>:message-<message id>, from the jobId prepNotify() gives it
function queueOf(jobKey: string): string {
	return jobKey.split(':')[1];
}
function messageOf(jobKey: string): string {
	return jobKey.split(':').at(-1)?.replace(/^message-/, '') ?? '';
}

/**
 * Adds up what the delivery jobs under a flow parent reported, from the parent's
 * getChildrenValues() and getIgnoredChildrenFailures(). The parent belongs to whoever
 * queued the deliveries (a blast's finalize job, for one); this is the arithmetic
 */
export function tallyDeliveries(
	values: Record<string, PushJobResult>,
	failures: Record<string, string> = {},
): DeliveryTotals {
	const push: DeliveryTotals['push'] = { sent: 0, gone: 0, rejected: 0, skipped: 0, failed: 0 };
	for (const [key, value] of Object.entries(values)) {
		if (queueOf(key) !== 'push') continue;
		push.sent += value.sent;
		push.gone += value.gone;
		push.rejected += value.rejected;
		if (value.skipped) push.skipped += 1;
	}
	for (const key of Object.keys(failures)) {
		if (queueOf(key) === 'push') push.failed += 1;
	}

	const recipients = new Set([...Object.keys(values), ...Object.keys(failures)].map(messageOf)).size;
	return { recipients, push };
}

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
