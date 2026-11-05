import type { Job } from 'bullmq';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageRepo from '../../repos/messageRepo.js';
import { emailQueue, pushQueue } from './queues.js';

const job = <Data>(data: Data) => ({ data }) as Job<Data>;

describe('final failure hooks', () => {
	let recordDelivery: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		recordDelivery = vi.spyOn(messageRepo, 'recordDelivery').mockResolvedValue(true);
		return () => recordDelivery.mockRestore();
	});

	it('records a push sent when a login got it on an earlier attempt', async () => {
		await pushQueue.onFailed!(job({ message: 5, sent: [41] }), new Error('push service down'));

		expect(recordDelivery).toHaveBeenCalledWith(expect.anything(), 5, 'push', 'sent');
	});

	it('records a push failed when no login got it', async () => {
		await pushQueue.onFailed!(job({ message: 5 }), new Error('push service down'));
		await pushQueue.onFailed!(job({ message: 6, sent: [] }), new Error('push service down'));

		expect(recordDelivery).toHaveBeenNthCalledWith(1, expect.anything(), 5, 'push', 'failed');
		expect(recordDelivery).toHaveBeenNthCalledWith(2, expect.anything(), 6, 'push', 'failed');
	});

	it('records an email failed', async () => {
		await emailQueue.onFailed!(job({ message: 7 }), new Error('relay down'));

		expect(recordDelivery).toHaveBeenCalledWith(expect.anything(), 7, 'email', 'failed');
	});
});
