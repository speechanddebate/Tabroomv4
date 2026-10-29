import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import logger from '../../helpers/logger.js';
import { RetryAfterError } from '../queue/backoff.js';
import { processPush, tallyDeliveries, type PushJobData } from './jobs.js';
import type { PushMessageResult } from './channels/webpush.js';

const { isPushConfigured, pushMessage } = vi.hoisted(() => ({
	isPushConfigured: vi.fn(),
	pushMessage: vi.fn(),
}));
vi.mock('./channels/webpush.js', () => ({ isPushConfigured, pushMessage }));

const outcome = (overrides: Partial<PushMessageResult> = {}): PushMessageResult => ({
	sent: [],
	gone: 0,
	rejected: 0,
	retry: { sessions: [] },
	...overrides,
});

function fakeJob(data: PushJobData) {
	const job = {
		id: '7',
		data,
		updateData: vi.fn(async (next: PushJobData) => { job.data = next; }),
	};
	return job as unknown as Job<PushJobData> & typeof job;
}

describe('processPush', () => {
	beforeEach(() => {
		isPushConfigured.mockReturnValue(true);
		pushMessage.mockReset().mockResolvedValue(outcome());
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('pushes the message and reports the counts', async () => {
		pushMessage.mockResolvedValue(outcome({ sent: [11, 12], gone: 1, rejected: 2 }));
		const job = fakeJob({ message: 5 });

		await expect(processPush(job)).resolves.toEqual({ sent: 2, gone: 1, rejected: 2 });
		expect(pushMessage).toHaveBeenCalledWith(5, []);
		expect(job.updateData).not.toHaveBeenCalled();
	});

	it('skips the logins an earlier attempt reached and counts them as sent', async () => {
		pushMessage.mockResolvedValue(outcome({ sent: [13] }));
		const job = fakeJob({ message: 5, sent: [11, 12] });

		await expect(processPush(job)).resolves.toEqual({ sent: 3, gone: 0, rejected: 0 });
		expect(pushMessage).toHaveBeenCalledWith(5, [11, 12]);
	});

	it('remembers what was sent and asks for a retry when a login was put off', async () => {
		pushMessage.mockResolvedValue(outcome({ sent: [12], retry: { sessions: [13], retryAfter: 30 } }));
		const job = fakeJob({ message: 5, sent: [11] });

		const error = await processPush(job).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RetryAfterError);
		expect((error as RetryAfterError).retryAfter).toBe(30);
		expect((error as Error).message).toContain('message 5');
		expect(job.updateData).toHaveBeenCalledWith({ message: 5, sent: [11, 12] });
	});

	it('asks for a retry without a Retry-After when the service gave none', async () => {
		pushMessage.mockResolvedValue(outcome({ retry: { sessions: [13] } }));

		const error = await processPush(fakeJob({ message: 5 })).catch((err: unknown) => err);

		expect(error).toBeInstanceOf(RetryAfterError);
		expect((error as RetryAfterError).retryAfter).toBeUndefined();
	});

	it('passes a skipped reason through', async () => {
		pushMessage.mockResolvedValue(outcome({ skipped: 'deleted' }));

		await expect(processPush(fakeJob({ message: 5 }))).resolves.toEqual({ sent: 0, gone: 0, rejected: 0, skipped: 'deleted' });
	});

	it('skips every job and warns once while push is not configured', async () => {
		await processPush(fakeJob({ message: 1 }));
		isPushConfigured.mockReturnValue(false);

		await expect(processPush(fakeJob({ message: 2 }))).resolves.toEqual({ sent: 0, gone: 0, rejected: 0, skipped: 'unconfigured' });
		await expect(processPush(fakeJob({ message: 3 }))).resolves.toMatchObject({ skipped: 'unconfigured' });

		expect(pushMessage).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledOnce();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not configured'));
	});

	it('lets a database error fail the job', async () => {
		pushMessage.mockRejectedValue(new Error('Connection lost'));

		await expect(processPush(fakeJob({ message: 5 }))).rejects.toThrow('Connection lost');
	});
});

describe('tallyDeliveries', () => {
	it('adds up the push results and failures', () => {
		const totals = tallyDeliveries({
			'bull:push:message-101': { sent: 2, gone: 1, rejected: 0 },
			'bull:push:message-102': { sent: 1, gone: 0, rejected: 1 },
			'bull:push:message-103': { sent: 0, gone: 0, rejected: 0, skipped: 'no subscriptions' },
		}, {
			'bull:push:message-104': 'Push for message 104 needs another try for 1 login(s)',
		});

		expect(totals).toEqual({ recipients: 4, push: { sent: 3, gone: 1, rejected: 1, skipped: 1, failed: 1 } });
	});

	it('counts a message once across channels and ignores other queues in the push totals', () => {
		const totals = tallyDeliveries({
			'bull:push:message-201': { sent: 1, gone: 0, rejected: 0 },
			'bull:email:message-201': { sent: 1, gone: 0, rejected: 0 },
		});

		expect(totals).toEqual({ recipients: 1, push: { sent: 1, gone: 0, rejected: 0, skipped: 0, failed: 0 } });
	});

	it('handles no deliveries at all', () => {
		expect(tallyDeliveries({})).toEqual({ recipients: 0, push: { sent: 0, gone: 0, rejected: 0, skipped: 0, failed: 0 } });
	});
});
