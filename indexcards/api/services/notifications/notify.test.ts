import { describe, it, expect, vi, beforeEach } from "vitest";
import factories from "../../../tests/factories/index.js";
import { db } from "../../data/database.js";
import logger from "../../helpers/logger.js";
import messageRepo from "../../repos/messageRepo.js";
import { notify, prepNotify, validateNotificationRequest, NotificationRequestError, NotificationRequestSchema } from "./notify.js";

const KEY = 'abcdef0123456789';
const { addJobs, vapid } = vi.hoisted(() => ({
	addJobs: vi.fn(),
	vapid: { value: null as { publicKey: string; fingerprint: string } | null },
}));
vi.mock('../queue/index.js', () => ({ addJobs }));
vi.mock('./channels/webpush.js', async (importOriginal) => ({
	...await importOriginal<typeof import('./channels/webpush.js')>(),
	getVapid: () => vapid.value,
}));

describe("Request Validation", () => {
	it("should accept a well-formed request", async () => {
		const validInput = {
			ids: [1, 2, 3],
			text: "test message",
			channels: { email: false, push: false },
		};
		expect(validateNotificationRequest(validInput)).toMatchSchema(NotificationRequestSchema);
	});
	it("applies each channel's default unless the request sets it", async () => {
		const everywhere = validateNotificationRequest({ ids: [1], text: "test message" });
		expect(everywhere.channels).toEqual({ inbox: true, email: true, push: true });

		const emailOnly = validateNotificationRequest({ ids: [1], text: "test message", channels: { inbox: false, push: false } });
		expect(emailOnly.channels).toEqual({ inbox: false, email: true, push: false });
	});
	it("accepts html without text", async () => {
		const request = validateNotificationRequest({ ids: [1], html: "<p>test message</p>" });
		expect(request.text).toBeUndefined();
		expect(request.html).toBe("<p>test message</p>");
	});
	it("rejects a request with neither text nor html", async () => {
		expect(() => validateNotificationRequest({ ids: [1] })).toThrow();
	});
	it("rejects a request with both text and html", async () => {
		expect(() => validateNotificationRequest({ ids: [1], text: "test message", html: "<p>test message</p>" })).toThrow();
	});
	it("drops repeated IDs", async () => {
		expect(validateNotificationRequest({ ids: [1, 1, 2], text: "test message" }).ids).toEqual([1, 2]);
	});
	it("accepts an empty ID array", async () => {
		expect(validateNotificationRequest({ ids: [], text: "test message" }).ids).toEqual([]);
	});
	it.each([
		['the request', { fromAddress: '<tab@tabroom.com>' }],
		['channels', { channels: { webpush: false } }],
		['push', { push: { topic: 'round-3' } }],
	])("rejects a key it doesn't know on %s", async (_where, extra) => {
		expect(() => validateNotificationRequest({ ids: [1], text: "test message", ...extra })).toThrow();
	});
	it("needs only recipients and a message", async () => {
		expect(() => validateNotificationRequest({ ids: [1], text: "test message" })).not.toThrow();
	});
});

describe('notify', () => {
	const messageRows = (people: number[]) => db.selectFrom('message')
		.select(['id', 'person', 'subject', 'body', 'url', 'sender', 'sender_string', 'email', 'visible_at', 'email_status', 'emailed_at', 'push_status', 'pushed_at'])
		.where('person', 'in', people)
		.orderBy('id')
		.execute();

	const base = { subject: 'Round 3 posted', url: '/user/home', text: 'You are in room 12', replyTo: 'Tab <tab@tabroom.com>' };

	let people: number[];
	/** Each person's one login that can receive push, in the order of people */
	let sessions: number[];
	let endpoint = 0;
	const subscribed = async (person: number) => (await factories.session.create({
		person,
		push_endpoint: `https://fcm.googleapis.com/fcm/send/notify-test-${person}-${++endpoint}`,
		push_p256dh: 'p256dh',
		push_auth: 'auth',
		push_vapid_key: KEY,
	})).id;

	beforeEach(async () => {
		// fresh people each time, so their inboxes hold only this test's messages
		people = [(await factories.person.create()).id, (await factories.person.create()).id];
		sessions = [await subscribed(people[0]), await subscribed(people[1])];
		vapid.value = { publicKey: 'public', fingerprint: KEY };
		addJobs.mockReset().mockResolvedValue(undefined);
	});

	it('writes a message for each recipient and queues a push job for each', async () => {
		const Sender = await factories.person.create();

		const response = await notify({ ...base, ids: people, sender: Sender.id, channels: { email: false } });

		expect(response).toEqual({ messages: 2, jobs: { push: 2, email: 0 } });

		const messages = await messageRows(people);
		expect(messages.map(message => message.person)).toEqual(people);
		expect(messages[0]).toMatchObject({
			subject: 'Round 3 posted',
			body: '<p>You are in room 12</p>',
			url: '/user/home',
			sender: Sender.id,
			sender_string: 'Tab <tab@tabroom.com>',
			email: null,
		});
		// Push is queued and unsettled; email, being off, has no status at all
		expect(messages.every(message => message.push_status === 'queued' && message.pushed_at === null)).toBe(true);
		expect(messages.every(message => message.email_status === null && message.emailed_at === null)).toBe(true);
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

	it('marks the deliveries failed and rethrows when the queue will not take the jobs', async () => {
		addJobs.mockRejectedValue(new Error('Job queues are not connected to Redis'));

		await expect(notify({ ...base, ids: people })).rejects.toThrow('not connected to Redis');

		// The inbox entries stay, and both channels say so rather than queued forever
		const messages = await messageRows(people);
		expect(messages).toHaveLength(2);
		expect(messages.every(message => message.email_status === 'failed' && message.emailed_at instanceof Date)).toBe(true);
		expect(messages.every(message => message.push_status === 'failed' && message.pushed_at instanceof Date)).toBe(true);
	});

	it('settles only the channels that had jobs when the queue will not take them', async () => {
		addJobs.mockRejectedValue(new Error('Timed out adding jobs'));

		await expect(notify({ ...base, ids: people, channels: { push: false } })).rejects.toThrow('Timed out');

		const messages = await messageRows(people);
		expect(messages.every(message => message.email_status === 'failed')).toBe(true);
		expect(messages.every(message => message.push_status === null && message.pushed_at === null)).toBe(true);
	});

	it('queues no push jobs when the channel is off', async () => {
		const response = await notify({ ...base, ids: people, channels: { email: false, push: false } });

		expect(response.jobs).toEqual({ push: 0, email: 0 });
		const messages = await messageRows(people);
		expect(messages).toHaveLength(2);
		expect(messages.every(message => message.push_status === null && message.email_status === null)).toBe(true);
		expect(addJobs).toHaveBeenCalledWith([]);
	});

	it('carries the push options into each push job', async () => {
		const push = { sessions, ttl: 60, urgency: 'high' as const };

		await notify({ ...base, ids: people, channels: { email: false }, push });

		const messages = await messageRows(people);
		expect(addJobs.mock.calls[0][0].map((job: { data: unknown }) => job.data))
			.toEqual(messages.map(message => ({ message: message.id, push })));
	});

	describe('push deliveries', () => {
		const pushJobs = () => (addJobs.mock.calls[0][0] as { queueName: string; data: { message: number } }[])
			.filter((delivery) => delivery.queueName === 'push');

		it('settles push as skipped and queues no job for someone with no login that can receive push', async () => {
			const Unsubscribed = await factories.person.create();

			const response = await notify({ ...base, ids: [...people, Unsubscribed.id], channels: { email: false } });

			expect(response.jobs).toEqual({ push: 2, email: 0 });
			const [skipped] = await messageRows([Unsubscribed.id]);
			expect(pushJobs().map(job => job.data.message)).not.toContain(skipped.id);
			expect(skipped.push_status).toBe('skipped');
			expect(skipped.pushed_at).toBeInstanceOf(Date);
			expect((await messageRows(people)).every(message => message.push_status === 'queued')).toBe(true);
		});

		it('queues push only for people with one of the given sessions', async () => {
			await notify({ ...base, ids: people, channels: { email: false }, push: { sessions: [sessions[0]] } });

			const [first, second] = await messageRows(people);
			expect(pushJobs().map(job => job.data.message)).toEqual([first.id]);
			expect(second.push_status).toBe('skipped');
		});

		it('skips every push and says so once when web push is not configured', async () => {
			vapid.value = null;
			const warn = vi.spyOn(logger, 'warn');

			await notify({ ...base, ids: people, channels: { email: false } });
			await notify({ ...base, ids: people, channels: { email: false } });

			expect(addJobs.mock.calls.every(([jobs]) => jobs.length === 0)).toBe(true);
			expect((await messageRows(people)).every(message => message.push_status === 'skipped')).toBe(true);
			expect(warn).toHaveBeenCalledOnce();
			expect(warn).toHaveBeenCalledWith(expect.any(String), { 'event.name': 'notification.push.unconfigured' });
			warn.mockRestore();
		});

		it('counts the deliveries it settles as skipped, which no job will record', async () => {
			const countSkipped = vi.spyOn(messageRepo, 'countSkipped');
			const OptedOutUnsubscribed = await factories.person.create({ no_email: 1 });

			await notify({ ...base, ids: [...people, OptedOutUnsubscribed.id] });

			expect(countSkipped).toHaveBeenCalledWith('email', 1);
			expect(countSkipped).toHaveBeenCalledWith('push', 1);
			countSkipped.mockRestore();
		});
	});

	it('rejects an urgency the push service does not know', async () => {
		await expect(prepNotify({ ...base, ids: people, push: { urgency: 'urgent' as 'high' } }))
			.rejects.toThrow('Invalid notification request');
	});

	describe('email deliveries', () => {
		const emailJobs = () => (addJobs.mock.calls[0][0] as { queueName: string; name: string; data: unknown; opts: Record<string, unknown> }[])
			.filter((delivery) => delivery.queueName === 'email');

		it('uses the channel defaults when none are named, queueing an email job per recipient after the push jobs', async () => {
			const response = await notify({ ...base, ids: people });

			expect(response).toEqual({ messages: 2, jobs: { push: 2, email: 2 } });

			const messages = await messageRows(people);
			expect(emailJobs()).toEqual(messages.map(message => ({
				queueName: 'email',
				name: 'email',
				data: { message: message.id },
				opts: expect.objectContaining({
					jobId: `message-${message.id}`,
					priority: 10,
					ignoreDependencyOnFailure: true,
					// Enough tries to outlast greylisting and a relay restart
					attempts: 8,
					backoff: { type: 'exponential', delay: expect.any(Number) },
				}),
			})));
			expect(messages.every(message => message.email_status === 'queued' && message.emailed_at === null)).toBe(true);
			expect(messages.every(message => message.push_status === 'queued')).toBe(true);
		});

		it('writes the message but queues no email for someone opted out', async () => {
			const OptedOut = await factories.person.create({ no_email: 1 });

			const response = await notify({ ...base, ids: [...people, OptedOut.id], channels: { push: false } });

			expect(response.jobs).toEqual({ push: 0, email: 2 });
			const [skipped] = await messageRows([OptedOut.id]);
			expect(skipped).toBeDefined();
			expect(emailJobs().map(job => (job.data as { message: number }).message)).not.toContain(skipped.id);

			// Settled at queue time, so the record says why nothing was sent
			expect(skipped.email_status).toBe('skipped');
			expect(skipped.emailed_at).toBeInstanceOf(Date);
			expect((await messageRows(people)).every(message => message.email_status === 'queued')).toBe(true);
		});

		it('queues account mail to someone opted out and marks the job', async () => {
			const OptedOut = await factories.person.create({ no_email: 1 });

			const response = await notify({ ...base, ids: [OptedOut.id], kind: 'account', channels: { inbox: false, push: false } });

			expect(response.jobs).toEqual({ push: 0, email: 1 });
			const [message] = await messageRows([OptedOut.id]);
			expect(emailJobs()[0].data).toEqual({ message: message.id, kind: 'account' });
			expect(message.email_status).toBe('queued');
		});

		it('queues no email for someone with no address', async () => {
			// Addresses are unique, so only one person can have a blank one; reuse it across runs
			const NoAddress = await db.selectFrom('person').select('id').where('email', '=', '').executeTakeFirst()
				?? await factories.person.create({ email: '' });

			const response = await notify({ ...base, ids: [NoAddress.id, people[0]], channels: { inbox: false, push: false } });

			expect(response.jobs).toEqual({ push: 0, email: 1 });
			expect(emailJobs()[0].data).toEqual({ message: (await messageRows([people[0]]))[0].id });
			// The blank-address person collects messages across runs, so read only this run's
			const [latest] = (await messageRows([NoAddress.id])).slice(-1);
			expect(latest.email_status).toBe('skipped');
			expect(latest.emailed_at).toBeInstanceOf(Date);
		});

		it('queues email to a given address, whatever the person\'s own address is', async () => {
			// Addresses are unique, so only one person can have a blank one; reuse it across runs
			const NoAddress = await db.selectFrom('person').select('id').where('email', '=', '').executeTakeFirst()
				?? await factories.person.create({ email: '' });

			const response = await notify({
				...base,
				ids: [NoAddress.id],
				to: 'old.address@example.org',
				kind: 'account',
				channels: { inbox: false, push: false },
			});

			expect(response.jobs).toEqual({ push: 0, email: 1 });
			const [latest] = (await messageRows([NoAddress.id])).slice(-1);
			expect(emailJobs()[0].data).toEqual({ message: latest.id, kind: 'account', to: 'old.address@example.org' });
			expect(latest.email_status).toBe('queued');
		});

		it.each(['tabroom', 'tourn'] as const)('refuses a to address on %s mail', async (kind) => {
			await expect(notify({ ...base, ids: [people[0]], kind, tourn: 1, to: 'old.address@example.org', channels: { push: false } }))
				.rejects.toThrow(NotificationRequestError);

			expect(addJobs).not.toHaveBeenCalled();
		});

		it('queues high priority email with no job priority, so it runs ahead of every other email', async () => {
			const response = await notify({ ...base, ids: [people[0]], priority: 'high', channels: { inbox: false, push: false } });

			expect(response.jobs).toEqual({ push: 0, email: 1 });
			expect(emailJobs()[0].opts).not.toHaveProperty('priority');
			expect(emailJobs()[0].opts).toMatchObject({ ignoreDependencyOnFailure: true });
		});

		it.each([
			['normal', 10],
			['low', 20],
		] as const)('queues %s priority email behind high', async (priority, expected) => {
			await notify({ ...base, ids: [people[0]], priority, channels: { inbox: false, push: false } });

			expect(emailJobs()[0].opts).toMatchObject({ priority: expected });
		});

		it('refuses a priority it doesn\'t know', async () => {
			// @ts-expect-error the type allows only the three levels
			await expect(notify({ ...base, ids: [people[0]], priority: 'urgent', channels: { push: false } }))
				.rejects.toThrow(NotificationRequestError);
		});

		it.each([
			['more than one recipient', { to: 'old.address@example.org' }, 2],
			['an address that isn\'t one', { to: 'not an address' }, 1],
		])('refuses a to address with %s', async (_case, extra, count) => {
			await expect(notify({ ...base, ids: people.slice(0, count), kind: 'account', ...extra, channels: { push: false } }))
				.rejects.toThrow(NotificationRequestError);

			expect(addJobs).not.toHaveBeenCalled();
		});

		it('marks the email job for tournament mail, and leaves the default tabroom kind off the job', async () => {
			const Tourn = await factories.tourn.create();

			await notify({ ...base, ids: [people[0]], kind: 'tourn', tourn: Tourn.id, channels: { inbox: false, push: false } });

			const [message] = await messageRows([people[0]]);
			// Staff-typed mail goes out under the tournament's name unless the caller says otherwise
			expect(emailJobs()[0].data).toEqual({ message: message.id, kind: 'tourn', as: 'tourn' });

			addJobs.mockClear();
			await notify({ ...base, ids: [people[1]], tourn: Tourn.id, channels: { inbox: false, push: false } });

			expect(emailJobs()[0].data).toEqual({ message: (await messageRows([people[1]]))[0].id });
		});

		it('marks the email job with whose name it goes out under when the caller says', async () => {
			const Tourn = await factories.tourn.create();
			const Sender = await factories.person.create();
			const off = { inbox: false, push: false };

			await notify({ ...base, ids: [people[0]], tourn: Tourn.id, as: 'tourn', channels: off });
			await notify({ ...base, ids: [people[1]], sender: Sender.id, as: 'person', channels: off });
			await notify({ ...base, ids: [people[0]], kind: 'tourn', tourn: Tourn.id, as: 'tabroom', channels: off });

			expect(addJobs.mock.calls.map(([jobs]) => jobs[0].data)).toEqual([
				{ message: expect.any(Number), as: 'tourn' },
				{ message: expect.any(Number), as: 'person' },
				{ message: expect.any(Number), kind: 'tourn' },
			]);
		});

		it.each([
			['as a tournament with no tourn', { as: 'tourn' }],
			['as a person with no sender', { as: 'person' }],
		] as const)('refuses mail sent %s', async (_case, extra) => {
			await expect(notify({ ...base, ids: [people[0]], ...extra, channels: { push: false } }))
				.rejects.toThrow(NotificationRequestError);

			expect(addJobs).not.toHaveBeenCalled();
		});

		it('refuses tournament mail with no tourn', async () => {
			await expect(notify({ ...base, ids: [people[0]], kind: 'tourn', channels: { push: false } }))
				.rejects.toThrow(NotificationRequestError);

			expect(addJobs).not.toHaveBeenCalled();
		});

		it('refuses a kind it doesn\'t know', async () => {
			// @ts-expect-error the type allows only the three kinds
			await expect(notify({ ...base, ids: [people[0]], kind: 'staff', channels: { push: false } }))
				.rejects.toThrow(NotificationRequestError);
		});

		it('queues no email jobs when the channel is off', async () => {
			const response = await notify({ ...base, ids: people, channels: { email: false, push: false } });

			expect(response.jobs.email).toBe(0);
			expect(emailJobs()).toEqual([]);
			expect((await messageRows(people)).every(message => message.email_status === null && message.emailed_at === null)).toBe(true);
		});
	});

	it('keeps the message out of the inbox when that channel is off', async () => {
		await notify({ ...base, ids: people, channels: { inbox: false, email: false } });

		const messages = await messageRows(people);
		expect(messages).toHaveLength(2);
		expect(messages.every(message => message.visible_at === null)).toBe(true);
	});

	it('links a blast email row and leaves the content to it', async () => {
		const email = await factories.email.create({ content: '<p>Room 12</p>' });

		await notify({ ...base, text: undefined, ids: people, html: '<p>Room 12</p>', emailId: email.id, channels: { email: false, push: false } });

		expect((await messageRows(people))[0]).toMatchObject({ email: email.id, body: null });
	});

	it('stores html as the body and adds the footer', async () => {
		await notify({ ...base, text: undefined, ids: people, html: '<p>Room 12</p>', append: 'Sent by Tab', channels: { email: false, push: false } });

		expect((await messageRows(people))[0].body).toBe('<p>Room 12</p><p>Sent by Tab</p>');
	});

	it('stores text as escaped html, so nothing in it is read as markup', async () => {
		await notify({ ...base, ids: people, text: 'Pat <script>alert(1)</script> asks\nspeaks < 26', append: 'A & B', channels: { email: false, push: false } });

		expect((await messageRows(people))[0].body)
			.toBe('<p>Pat &lt;script&gt;alert(1)&lt;/script&gt; asks<br>speaks &lt; 26</p><p>A &amp; B</p>');
	});

	it('stores only what tournament staff may send of the html they typed', async () => {
		const Tourn = await factories.tourn.create();
		const html = '<div class="x"><p>Rounds start at <b>8:00</b>.</p><img src="https://example.com/pixel.gif">'
			+ '<script>alert(1)</script><p><a href="javascript:alert(1)">Bad</a></p></div>';

		await notify({ ...base, text: undefined, ids: people, html, kind: 'tourn', tourn: Tourn.id, channels: { email: false, push: false } });

		expect((await messageRows(people))[0].body).toBe('<p>Rounds start at <b>8:00</b>.</p><p><a>Bad</a></p>');
	});

	it('stores html Tabroom built as it is', async () => {
		const html = '<div><p><a href="https://www.tabroom.com" style="display: inline-block;">Confirm</a></p></div>';

		await notify({ ...base, text: undefined, ids: people, html, kind: 'account', channels: { email: false, push: false } });

		expect((await messageRows(people))[0].body).toBe(html);
	});

	it('stores html as the body', async () => {
		await notify({ ...base, text: undefined, ids: people, html: '<p>Room 12</p>', channels: { email: false, push: false } });

		expect((await messageRows(people))[0].body).toBe('<p>Room 12</p>');
	});

	it('keeps a footer on the message even when linked to an email row', async () => {
		const email = await factories.email.create();

		await notify({ ...base, ids: people, emailId: email.id, append: 'Sent by Tab', channels: { email: false, push: false } });

		expect((await messageRows(people))[0].body).toBe('<p>You are in room 12</p><p>Sent by Tab</p>');
	});

	it('prepNotify writes the records and builds the deliveries without queueing', async () => {
		const prepared = await prepNotify({ ...base, ids: people, channels: { email: false } });

		expect(prepared.messages.map(message => message.person)).toEqual(people);
		expect(await messageRows(people)).toHaveLength(2);
		expect(prepared.deliveries.map(delivery => delivery.data)).toEqual(prepared.messages.map(message => ({ message: message.id })));
		expect(addJobs).not.toHaveBeenCalled();
	});

	it('prepNotify throws on an invalid request', async () => {
		await expect(prepNotify({ ...base, ids: people, html: '<p>Room 12</p>' })).rejects.toThrow('Invalid notification request');
		expect(await messageRows(people)).toEqual([]);
	});

	it('notifies nobody when there are no recipients', async () => {
		const insertInto = vi.spyOn(db, 'insertInto');

		expect(await notify({ ...base, ids: [] })).toEqual({ messages: 0, jobs: { push: 0, email: 0 } });
		expect(insertInto).not.toHaveBeenCalled();
		insertInto.mockRestore();
	});
});
