import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';
import logger from '../../helpers/logger.js';
import { RetryAfterError } from '../queue/backoff.js';
import { processPush, type PushJobData } from './jobs.js';
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
