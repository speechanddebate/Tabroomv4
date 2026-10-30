import { describe, it, expect, vi, beforeEach } from "vitest";
import factories from "../../../tests/factories/index.js";
import { db } from "../../data/database.js";
import { notify, prepNotify, validateNotificationRequest, NotificationRequestSchema } from "./notify.js";

const { addJobs } = vi.hoisted(() => ({ addJobs: vi.fn() }));
vi.mock('../queue/index.js', () => ({ addJobs }));

describe("Request Validation", () => {
	it("should accept a well-formed request", async () => {
		const validInput = {
			ids: [1, 2, 3],
			text: "test message",
			subject: null,
			body: null,
			url: null,
			channels: { inbox: true },
		};
		expect(validateNotificationRequest(validInput)).toMatchSchema(NotificationRequestSchema);
	});
	it("should reject duplicate IDs", async () => {
		const invalidInput = {
			ids: [1, 1, 2],
			text: "test message",
			channels: { inbox: true },
		};
		expect(() => validateNotificationRequest(invalidInput)).toThrow();
	});
	it("should reject an empty ID array", async () => {
		const invalidInput = {
			ids: [],
			text: "test message",
			channels: { inbox: true },
		};
		expect(() => validateNotificationRequest(invalidInput)).toThrow();
	});
});

describe('notify', () => {
	const messageRows = (people: number[]) => db.selectFrom('message')
		.select(['id', 'person', 'subject', 'body', 'url', 'sender', 'sender_string', 'email', 'visible_at'])
		.where('person', 'in', people)
		.orderBy('id')
		.execute();

	// The schema requires these keys even when null
	const base = { subject: 'Round 3 posted', body: null, url: '/user/home', text: 'You are in room 12', from: 'Tab <tab@tabroom.com>' };

	let people: number[];

	beforeEach(async () => {
		// fresh people each time, so their inboxes hold only this test's messages
		people = [(await factories.person.create()).id, (await factories.person.create()).id];
		addJobs.mockReset().mockResolvedValue(undefined);
	});

	it('writes a message for each recipient and queues a push job for each', async () => {
		const Sender = await factories.person.create();

		const response = await notify({ ...base, ids: people, sender: Sender.id, channels: { inbox: true, webpush: true } });

		expect(response).toMatchObject({ error: false, inbox: 2, jobs: { push: 2 } });

		const messages = await messageRows(people);
		expect(messages.map(message => message.person)).toEqual(people);
		expect(messages[0]).toMatchObject({
			subject: 'Round 3 posted',
			body: 'You are in room 12',
			url: '/user/home',
			sender: Sender.id,
			sender_string: 'Tab <tab@tabroom.com>',
			email: null,
		});
		expect(messages[0].visible_at).toBeInstanceOf(Date);
		// Visible from the moment it was written, so the inbox shows it on the next read
		expect(Math.abs(messages[0].visible_at!.getTime() - Date.now())).toBeLessThan(5000);

		expect(addJobs).toHaveBeenCalledOnce();
		expect(addJobs.mock.calls[0][0]).toEqual(messages.map(message => ({
			queueName: 'push',
			name: 'push',
			data: { message: message.id },
			// The queue's own options come along, for callers that put the jobs in a flow
			opts: expect.objectContaining({
				jobId: `message-${message.id}`,
				ignoreDependencyOnFailure: true,
				attempts: 3,
				backoff: { type: 'custom' },
			}),
		})));
	});

	it('queues no push jobs when the channel is off', async () => {
		const response = await notify({ ...base, ids: people, channels: { inbox: true } });

		expect(response.jobs).toEqual({ push: 0, email: 0 });
		expect(await messageRows(people)).toHaveLength(2);
		expect(addJobs).toHaveBeenCalledWith([]);
	});

	describe('email deliveries', () => {
		const emailJobs = () => (addJobs.mock.calls[0][0] as { queueName: string; name: string; data: unknown; opts: Record<string, unknown> }[])
			.filter((delivery) => delivery.queueName === 'email');

		it('queues an email job for each recipient after the push jobs, with the queue options', async () => {
			const response = await notify({ ...base, ids: people, channels: { inbox: true, webpush: true, email: true } });

			expect(response).toMatchObject({ error: false, inbox: 2, email: 2, jobs: { push: 2, email: 2 } });

			const messages = await messageRows(people);
			expect(emailJobs()).toEqual(messages.map(message => ({
				queueName: 'email',
				name: 'email',
				data: { message: message.id },
				opts: expect.objectContaining({
					jobId: `message-${message.id}`,
					priority: 10,
					ignoreDependencyOnFailure: true,
					attempts: 3,
					backoff: { type: 'exponential', delay: expect.any(Number) },
				}),
			})));
		});

		it('writes the message but queues no email for someone opted out', async () => {
			const OptedOut = await factories.person.create({ no_email: 1 });

			const response = await notify({ ...base, ids: [...people, OptedOut.id], channels: { inbox: true, email: true } });

			expect(response.jobs).toEqual({ push: 0, email: 2 });
			expect(await messageRows([OptedOut.id])).toHaveLength(1);
			expect(emailJobs().map(job => (job.data as { message: number }).message))
				.not.toContain((await messageRows([OptedOut.id]))[0].id);
		});

		it('queues account mail to someone opted out and marks the job', async () => {
			const OptedOut = await factories.person.create({ no_email: 1 });

			const response = await notify({ ...base, ids: [OptedOut.id], ignoreNoEmail: true, channels: { email: true } });

			expect(response.jobs).toEqual({ push: 0, email: 1 });
			expect(emailJobs()[0].data).toEqual({ message: (await messageRows([OptedOut.id]))[0].id, ignoreNoEmail: true });
		});

		it('queues no email for someone with no address', async () => {
			// Addresses are unique, so only one person can have a blank one; reuse it across runs
			const NoAddress = await db.selectFrom('person').select('id').where('email', '=', '').executeTakeFirst()
				?? await factories.person.create({ email: '' });

			const response = await notify({ ...base, ids: [NoAddress.id, people[0]], channels: { email: true } });

			expect(response.jobs).toEqual({ push: 0, email: 1 });
			expect(emailJobs()[0].data).toEqual({ message: (await messageRows([people[0]]))[0].id });
		});

		it('queues no email jobs when the channel is off', async () => {
			const response = await notify({ ...base, ids: people, channels: { inbox: true } });

			expect(response.email).toBe(0);
			expect(emailJobs()).toEqual([]);
		});
	});

	it('keeps the message out of the inbox when that channel is off', async () => {
		await notify({ ...base, ids: people, channels: { webpush: true } });

		const messages = await messageRows(people);
		expect(messages).toHaveLength(2);
		expect(messages.every(message => message.visible_at === null)).toBe(true);
	});

	it('links a blast email row and leaves the content to it', async () => {
		const email = await factories.email.create({ content: '<p>Room 12</p>' });

		await notify({ ...base, ids: people, html: '<p>Room 12</p>', emailId: email.id, channels: { inbox: true } });

		expect((await messageRows(people))[0]).toMatchObject({ email: email.id, body: null });
	});

	it('stores html as the body and adds the footer', async () => {
		await notify({ ...base, ids: people, html: '<p>Room 12</p>', append: 'Sent by Tab', channels: { inbox: true } });

		expect((await messageRows(people))[0].body).toBe('<p>Room 12</p>\nSent by Tab');
	});

	it('keeps a footer on the message even when linked to an email row', async () => {
		const email = await factories.email.create();

		await notify({ ...base, ids: people, emailId: email.id, append: 'Sent by Tab', channels: { inbox: true } });

		expect((await messageRows(people))[0].body).toBe('You are in room 12\nSent by Tab');
	});

	it('prepNotify writes the records and builds the deliveries without queueing', async () => {
		const prepared = await prepNotify({ ...base, ids: people, channels: { inbox: true, webpush: true } });

		expect(prepared.messages.map(message => message.person)).toEqual(people);
		expect(await messageRows(people)).toHaveLength(2);
		expect(prepared.deliveries.map(delivery => delivery.data)).toEqual(prepared.messages.map(message => ({ message: message.id })));
		expect(addJobs).not.toHaveBeenCalled();
	});

	it('prepNotify throws on an invalid request', async () => {
		await expect(prepNotify({ ...base, ids: [], channels: { inbox: true } })).rejects.toThrow('Invalid notification request');
	});

	it('rejects an invalid request without writing anything', async () => {
		const response = await notify({ ...base, ids: [], channels: { inbox: true } });

		expect(response).toMatchObject({ error: true, inbox: 0 });
		expect(addJobs).not.toHaveBeenCalled();
	});
});
