import type { Processor } from 'bullmq';
import config from '../../config.js';
import { db } from '../../data/database.js';
import logger from '../../helpers/logger.js';
import messageRepo, { type DeliveryStatus } from '../../repos/messageRepo.js';
import { RetryAfterError } from '../queue/backoff.js';
import { emailMessage, type EmailMessageResult } from './channels/email.js';
import { isPushConfigured, pushMessage, type PushMessageOptions, type PushMessageResult } from './channels/webpush.js';

// Job data is ids only; the job loads the rest from the database

/** ignoreNoEmail is the one piece of request context the job can't reload: mail about the person's own account goes out even to someone opted out */
export type EmailJobData = { message: number, ignoreNoEmail?: boolean };
/** sent lists the logins earlier attempts reached; push is the request's narrowing and send options, which the job can't reload */
export type PushJobData = { message: number, sent?: number[], push?: PushMessageOptions };

/** What a set of delivery jobs added up to, for whatever runs after them */
export type DeliveryTotals = {
	/** Distinct messages the jobs were for */
	recipients: number;
	email: {
		/** Messages the relay accepted */
		sent: number;
		/** Messages logged instead of sent, because mail mode is log on the worker */
		logged: number;
		/** Messages the relay refused */
		rejected: number;
		/** Jobs that had nothing to send: no address, opted out, deleted */
		skipped: number;
		/** Jobs that gave up after their retries */
		failed: number;
	};
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
	values: Record<string, PushJobResult | EmailJobResult>,
	failures: Record<string, string> = {},
): DeliveryTotals {
	const email: DeliveryTotals['email'] = { sent: 0, logged: 0, rejected: 0, skipped: 0, failed: 0 };
	const push: DeliveryTotals['push'] = { sent: 0, gone: 0, rejected: 0, skipped: 0, failed: 0 };
	for (const [key, value] of Object.entries(values)) {
		switch (queueOf(key)) {
			case 'email': {
				const result = value as EmailJobResult;
				if (result.status === 'skipped') email.skipped += 1;
				else email[result.status] += 1;
				break;
			}
			case 'push': {
				const result = value as PushJobResult;
				push.sent += result.sent;
				push.gone += result.gone;
				push.rejected += result.rejected;
				if (result.skipped) push.skipped += 1;
				break;
			}
		}
	}
	for (const key of Object.keys(failures)) {
		if (queueOf(key) === 'email') email.failed += 1;
		if (queueOf(key) === 'push') push.failed += 1;
	}

	const recipients = new Set([...Object.keys(values), ...Object.keys(failures)].map(messageOf)).size;
	return { recipients, email, push };
}

/** What an email job reports when it finishes. A relay that asked for later is a retry of the job, not a result */
export type EmailJobResult = {
	status: Exclude<EmailMessageResult['status'], 'retry'>;
	/** Why nothing was sent, when nothing was */
	skipped?: EmailMessageResult['skipped'];
};

let warnedLogMode = false;

/** Emails one message to its person, letting the queue retry when the relay or the network was busy */
export const processEmail: Processor<EmailJobData, EmailJobResult> = async (job) => {
	// A worker in log mode is an environment choice, so say so once rather than on every job
	if (config.mail.mode === 'log') {
		if (!warnedLogMode) {
			warnedLogMode = true;
			logger.warn('Email jobs are being logged, not sent: mail mode is log on this worker', {
				'event.name': 'notification.email.log_mode',
			});
		}
	} else {
		warnedLogMode = false;
	}

	const result = await emailMessage(job.data.message, { ignoreNoEmail: job.data.ignoreNoEmail });

	if (result.status === 'retry') {
		throw new Error(`Email for message ${job.data.message} needs another try, the relay or the network was busy`);
	}

	// A message already delivered keeps the outcome it has
	if (result.skipped !== 'already delivered') {
		await messageRepo.recordDelivery(db, job.data.message, 'email', result.status);
	}

	return {
		status: result.status,
		...(result.skipped ? { skipped: result.skipped } : {}),
	};
};

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

/**
 * How a push job ended for the message as a whole: sent once any login got it, across
 * every attempt; rejected when logins were tried and none took it; skipped when there
 * was nothing to try
 */
function pushStatus(sent: number, result: PushMessageResult): DeliveryStatus['push'] {
	if (sent > 0) return 'sent';
	if (result.skipped) return 'skipped';
	return result.rejected + result.gone > 0 ? 'rejected' : 'skipped';
}

let warnedUnconfigured = false;

/** Pushes one message to its person's subscribed logins, retrying the ones the push service put off */
export const processPush: Processor<PushJobData, PushJobResult> = async (job) => {
	// A worker without keys is an environment choice, so say so once rather than fail every job
	if (!isPushConfigured()) {
		if (!warnedUnconfigured) {
			warnedUnconfigured = true;
			logger.warn('Push jobs are being skipped, web push is not configured on this worker', {
				'event.name': 'notification.push.unconfigured',
			});
		}
		await messageRepo.recordDelivery(db, job.data.message, 'push', 'skipped');
		return { sent: 0, gone: 0, rejected: 0, skipped: 'unconfigured' };
	}
	warnedUnconfigured = false;

	const before = job.data.sent ?? [];
	const result = await pushMessage(job.data.message, before, job.data.push);
	const sent = [...before, ...result.sent];

	if (result.retry.sessions.length > 0) {
		// Remembered on the job so the next attempt skips the logins this one reached
		await job.updateData({ ...job.data, sent });
		throw new RetryAfterError(
			`Push for message ${job.data.message} needs another try for ${result.retry.sessions.length} login(s)`,
			result.retry.retryAfter,
		);
	}

	// A message already delivered keeps the outcome it has
	if (result.skipped !== 'already delivered') {
		await messageRepo.recordDelivery(db, job.data.message, 'push', pushStatus(sent.length, result));
	}

	return {
		sent: sent.length,
		gone: result.gone,
		rejected: result.rejected,
		...(result.skipped ? { skipped: result.skipped } : {}),
	};
};
