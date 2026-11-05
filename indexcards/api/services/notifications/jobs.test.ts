import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import config from '../../config.js';
import logger from '../../helpers/logger.js';
import { RetryAfterError } from '../queue/backoff.js';
import { processEmail, processPush, tallyDeliveries, type EmailJobData, type PushJobData } from './jobs.js';
import type { EmailMessageResult } from './channels/email.js';
import type { PushMessageResult } from './channels/webpush.js';

const { isPushConfigured, pushMessage, emailMessage, recordDelivery } = vi.hoisted(() => ({
	isPushConfigured: vi.fn(),
	pushMessage: vi.fn(),
	emailMessage: vi.fn(),
	recordDelivery: vi.fn(),
}));
vi.mock('./channels/webpush.js', () => ({ isPushConfigured, pushMessage }));
vi.mock('./channels/email.js', () => ({ emailMessage }));
vi.mock('../../repos/messageRepo.js', () => ({ default: { recordDelivery } }));

/** The status a job recorded for message 5, or undefined when it recorded none */
const recorded = (channel: 'email' | 'push') => {
	const call = recordDelivery.mock.calls.find(([, message, recordedChannel]) => message === 5 && recordedChannel === channel);
	return call?.[3] as string | undefined;
};

const outcome = (overrides: Partial<PushMessageResult> = {}): PushMessageResult => ({
	sent: [],
	gone: 0,
	rejected: 0,
	retry: { sessions: [] },
	...overrides,
});

function fakeJob<Data>(data: Data) {
	const job = {
		id: '7',
		data,
		updateData: vi.fn(async (next: Data) => { job.data = next; }),
	};
	return job as unknown as Job<Data> & typeof job;
}

describe('processPush', () => {
	beforeEach(() => {
		isPushConfigured.mockReturnValue(true);
		pushMessage.mockReset().mockResolvedValue(outcome());
		recordDelivery.mockReset().mockResolvedValue(true);
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('pushes the message and reports the counts', async () => {
		pushMessage.mockResolvedValue(outcome({ sent: [11, 12], gone: 1, rejected: 2 }));
		const job = fakeJob<PushJobData>({ message: 5 });

		await expect(processPush(job)).resolves.toEqual({ sent: 2, gone: 1, rejected: 2 });
		expect(pushMessage).toHaveBeenCalledWith(5, [], undefined);
		expect(job.updateData).not.toHaveBeenCalled();
		// Any login reaching it makes the message sent, whatever the others did
		expect(recordDelivery).toHaveBeenCalledWith(expect.anything(), 5, 'push', 'sent');
	});

	it('skips the logins an earlier attempt reached and counts them as sent', async () => {
		pushMessage.mockResolvedValue(outcome({ sent: [13] }));
		const job = fakeJob<PushJobData>({ message: 5, sent: [11, 12] });

		await expect(processPush(job)).resolves.toEqual({ sent: 3, gone: 0, rejected: 0 });
		expect(pushMessage).toHaveBeenCalledWith(5, [11, 12], undefined);
	});

	it('forwards the push options and keeps them across a retry', async () => {
		pushMessage.mockResolvedValue(outcome({ retry: { sessions: [12] } }));
		const push = { sessions: [12], ttl: 60, urgency: 'high' as const };
		const job = fakeJob<PushJobData>({ message: 5, push });

		await expect(processPush(job)).rejects.toThrow(RetryAfterError);
		expect(pushMessage).toHaveBeenCalledWith(5, [], push);
		expect(job.data.push).toEqual(push);
	});

	it('records sent when an earlier attempt reached a login and this one found nothing left', async () => {
		pushMessage.mockResolvedValue(outcome({ skipped: 'no subscriptions' }));

		await processPush(fakeJob<PushJobData>({ message: 5, sent: [11] }));

		expect(recorded('push')).toBe('sent');
	});

	it.each([
		['rejected', outcome({ rejected: 1 })],
		['rejected', outcome({ gone: 2 })],
		['skipped', outcome({ skipped: 'no subscriptions' })],
		['skipped', outcome({ skipped: 'deleted' })],
	] as const)('records %s when no login got it', async (status, result) => {
		pushMessage.mockResolvedValue(result);

		await processPush(fakeJob<PushJobData>({ message: 5 }));

		expect(recorded('push')).toBe(status);
	});

	it('records nothing for a message already delivered, keeping the outcome it has', async () => {
		pushMessage.mockResolvedValue(outcome({ skipped: 'already delivered' }));

		await expect(processPush(fakeJob<PushJobData>({ message: 5 }))).resolves.toMatchObject({ skipped: 'already delivered' });
		expect(recordDelivery).not.toHaveBeenCalled();
	});

	it('remembers what was sent and asks for a retry when a login was put off', async () => {
		pushMessage.mockResolvedValue(outcome({ sent: [12], retry: { sessions: [13], retryAfter: 30 } }));
		const job = fakeJob<PushJobData>({ message: 5, sent: [11] });

		const error = await processPush(job).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RetryAfterError);
		expect((error as RetryAfterError).retryAfter).toBe(30);
		expect((error as Error).message).toContain('message 5');
		expect(job.updateData).toHaveBeenCalledWith({ message: 5, sent: [11, 12] });
		// Still in progress, so the message stays queued
		expect(recordDelivery).not.toHaveBeenCalled();
	});

	it('asks for a retry without a Retry-After when the service gave none', async () => {
		pushMessage.mockResolvedValue(outcome({ retry: { sessions: [13] } }));

		const error = await processPush(fakeJob<PushJobData>({ message: 5 })).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RetryAfterError);
		expect((error as RetryAfterError).retryAfter).toBeUndefined();
	});

	it('passes a skipped reason through', async () => {
		pushMessage.mockResolvedValue(outcome({ skipped: 'deleted' }));

		await expect(processPush(fakeJob<PushJobData>({ message: 5 }))).resolves.toEqual({ sent: 0, gone: 0, rejected: 0, skipped: 'deleted' });
	});

	it('skips every job and warns once while push is not configured', async () => {
		await processPush(fakeJob<PushJobData>({ message: 1 }));
		isPushConfigured.mockReturnValue(false);

		await expect(processPush(fakeJob<PushJobData>({ message: 2 }))).resolves.toEqual({ sent: 0, gone: 0, rejected: 0, skipped: 'unconfigured' });
		await expect(processPush(fakeJob<PushJobData>({ message: 3 }))).resolves.toMatchObject({ skipped: 'unconfigured' });

		expect(pushMessage).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not configured'), {
			'event.name': 'notification.push.unconfigured',
		});
		expect(recordDelivery).toHaveBeenCalledWith(expect.anything(), 2, 'push', 'skipped');
		expect(recordDelivery).toHaveBeenCalledWith(expect.anything(), 3, 'push', 'skipped');
	});

	it('lets a database error fail the job', async () => {
		pushMessage.mockRejectedValue(new Error('Connection lost'));

		await expect(processPush(fakeJob<PushJobData>({ message: 5 }))).rejects.toThrow('Connection lost');
		expect(recordDelivery).not.toHaveBeenCalled();
	});
});

describe('processEmail', () => {
	const originalMode = config.mail.mode;
	const result = (overrides: Partial<EmailMessageResult> = {}): EmailMessageResult => ({ status: 'sent', ...overrides });

	beforeEach(() => {
		config.mail.mode = 'live';
		emailMessage.mockReset().mockResolvedValue(result());
		recordDelivery.mockReset().mockResolvedValue(true);
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	});

	afterEach(() => {
		config.mail.mode = originalMode;
		vi.restoreAllMocks();
	});

	it('emails the message and reports the status', async () => {
		await expect(processEmail(fakeJob<EmailJobData>({ message: 5 }))).resolves.toEqual({ status: 'sent' });
		expect(emailMessage).toHaveBeenCalledWith(5, { ignoreNoEmail: undefined });
		expect(recordDelivery).toHaveBeenCalledWith(expect.anything(), 5, 'email', 'sent');
	});

	it('forwards the account-mail flag', async () => {
		await processEmail(fakeJob<EmailJobData>({ message: 5, ignoreNoEmail: true }));

		expect(emailMessage).toHaveBeenCalledWith(5, { ignoreNoEmail: true });
	});

	it.each(['logged', 'rejected'] as const)('passes %s through and records it', async (status) => {
		emailMessage.mockResolvedValue(result({ status }));

		await expect(processEmail(fakeJob<EmailJobData>({ message: 5 }))).resolves.toEqual({ status });
		expect(recorded('email')).toBe(status);
	});

	it('passes a skipped reason through and records the skip', async () => {
		emailMessage.mockResolvedValue(result({ status: 'skipped', skipped: 'opted out' }));

		await expect(processEmail(fakeJob<EmailJobData>({ message: 5 }))).resolves.toEqual({ status: 'skipped', skipped: 'opted out' });
		expect(recorded('email')).toBe('skipped');
	});

	it('records nothing for a message already delivered, keeping the outcome it has', async () => {
		emailMessage.mockResolvedValue(result({ status: 'skipped', skipped: 'already delivered' }));

		await expect(processEmail(fakeJob<EmailJobData>({ message: 5 }))).resolves.toEqual({ status: 'skipped', skipped: 'already delivered' });
		expect(recordDelivery).not.toHaveBeenCalled();
	});

	it('asks the queue for another try when the relay was busy', async () => {
		emailMessage.mockResolvedValue(result({ status: 'retry' }));

		await expect(processEmail(fakeJob<EmailJobData>({ message: 5 }))).rejects.toThrow('message 5');
		// Still in progress, so the message stays queued
		expect(recordDelivery).not.toHaveBeenCalled();
	});

	it('warns once while the worker is in log mode and keeps logging the messages', async () => {
		await processEmail(fakeJob<EmailJobData>({ message: 1 }));
		config.mail.mode = 'log';
		emailMessage.mockResolvedValue(result({ status: 'logged' }));

		await expect(processEmail(fakeJob<EmailJobData>({ message: 2 }))).resolves.toEqual({ status: 'logged' });
		await processEmail(fakeJob<EmailJobData>({ message: 3 }));

		expect(emailMessage).toHaveBeenCalledTimes(3);
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('mail mode is log'), {
			'event.name': 'notification.email.log_mode',
		});
	});

	it('lets a database error fail the job', async () => {
		emailMessage.mockRejectedValue(new Error('Connection lost'));

		await expect(processEmail(fakeJob<EmailJobData>({ message: 5 }))).rejects.toThrow('Connection lost');
	});
});

describe('tallyDeliveries', () => {
	const empty = {
		email: { sent: 0, logged: 0, rejected: 0, skipped: 0, failed: 0 },
		push: { sent: 0, gone: 0, rejected: 0, skipped: 0, failed: 0 },
	};

	it('adds up the push results and failures', () => {
		const totals = tallyDeliveries({
			'bull:push:message-101': { sent: 2, gone: 1, rejected: 0 },
			'bull:push:message-102': { sent: 1, gone: 0, rejected: 1 },
			'bull:push:message-103': { sent: 0, gone: 0, rejected: 0, skipped: 'no subscriptions' },
		}, {
			'bull:push:message-104': 'Push for message 104 needs another try for 1 login(s)',
		});

		expect(totals).toEqual({ recipients: 4, email: empty.email, push: { sent: 3, gone: 1, rejected: 1, skipped: 1, failed: 1 } });
	});

	it('adds up the email results and failures', () => {
		const totals = tallyDeliveries({
			'bull:email:message-201': { status: 'sent' },
			'bull:email:message-202': { status: 'sent' },
			'bull:email:message-203': { status: 'logged' },
			'bull:email:message-204': { status: 'rejected' },
			'bull:email:message-205': { status: 'skipped', skipped: 'opted out' },
		}, {
			'bull:email:message-206': 'Email for message 206 needs another try',
		});

		expect(totals).toEqual({ recipients: 6, email: { sent: 2, logged: 1, rejected: 1, skipped: 1, failed: 1 }, push: empty.push });
	});

	it('counts a message once across channels and keeps the queues apart', () => {
		const totals = tallyDeliveries({
			'bull:push:message-301': { sent: 1, gone: 0, rejected: 0 },
			'bull:email:message-301': { status: 'sent' },
		}, {
			'bull:email:message-302': 'gave up',
			'bull:push:message-302': 'gave up',
		});

		expect(totals).toEqual({
			recipients: 2,
			email: { sent: 1, logged: 0, rejected: 0, skipped: 0, failed: 1 },
			push: { sent: 1, gone: 0, rejected: 0, skipped: 0, failed: 1 },
		});
	});

	it('handles no deliveries at all', () => {
		expect(tallyDeliveries({})).toEqual({ recipients: 0, ...empty });
	});
});
