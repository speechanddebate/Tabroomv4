import { z } from "zod";
import { db } from "../../data/database.js";
import logger from "../../helpers/logger.js";
import { sanitizeHTML } from "../../helpers/text.js";
import messageRepo from "../../repos/messageRepo.js";
import sessionRepo from "../../repos/sessionRepo.js";
import { addJobs, type FlowNode } from "../queue/index.js";
import { emailQueue, pushQueue } from "./queues.js";
import { getVapid } from "./channels/webpush.js";
import { EMAIL_HTML, textToHtml } from "./templates/html.js";

/**
 * Who the email is from, which decides its footer. account: about the person's own account, so it
 * reaches someone opted out and offers no unsubscribe. tabroom: everything else Tabroom writes,
 * including mail generated from a tournament's data. tourn: free text a tournament's staff typed,
 * sanitized and footed as the tournament's
 */
export const EmailKindSchema = z.enum(['account', 'tabroom', 'tourn']);
export type EmailKind = z.infer<typeof EmailKindSchema>;

/**
 * Whose name the email goes out under, which decides its From and where replies go. tabroom: the
 * configured address. tourn: the tournament's name on an address of its own. person: the sender's
 * name, with replies to their own address
 */
export const EmailSenderSchema = z.enum(['tabroom', 'tourn', 'person']);
export type EmailSender = z.infer<typeof EmailSenderSchema>;

/**
 * A notification to deliver. Strict at every level, so a key the service doesn't know is refused
 * rather than dropped
 */
export const NotificationRequestSchema = z.strictObject({
	/** The people to notify; repeats are dropped, and none at all is a notification to nobody */
	ids     : z.array(z.number()).transform((ids) => [...new Set(ids)]),
	subject : z.string().max(255).optional(),
	/** The message as plain text; a request carries this or html, never both */
	text    : z.string().max(65535).optional(), //mariadb text limit
	html    : z.string().optional(),
	/** Where an inbox or push click-through lands; never shown in the email */
	url     : z.string().max(511).optional(),
	/**
	 * @deprecated Plain text added after the body as its own paragraphs. The caller or its
	 * template builds the whole message instead; removed once the pairing blasts stop passing it
	 */
	append  : z.string().optional(),
	/** The person the inbox shows as the sender */
	sender  : z.number().optional(),
	replyTo : z.string().optional(),
	/** The blast's email row, when the caller recorded one */
	emailId : z.number().optional(),
	tourn   : z.number().optional(),
	/** tourn needs tourn */
	kind    : EmailKindSchema.default('tabroom'),
	/** Default tourn for tourn mail, tabroom otherwise. tourn needs tourn, person needs sender */
	as      : EmailSenderSchema.optional(),
	/** Where email waits in the queue: high for mail someone is waiting on (a confirmation code), low for big blasts */
	priority : z.enum(['low', 'normal', 'high']).default('normal'),
	/** An address to email instead of the person's own, such as their old one after a change; account mail to one recipient only */
	to      : z.email().optional(),
	push: z.strictObject({
		sessions : z.array(z.number()).optional(),
		ttl      : z.int().min(0).optional(),
		urgency  : z.enum(['very-low', 'low', 'normal', 'high']).optional(),
	}).optional(),
	// Each channel carries its own default, so a caller names only the ones it wants different.
	// The general-purpose channels default on; a channel for particular cases (SMS, say) would default off
	channels: z.strictObject({
		inbox : z.boolean().default(true),
		email : z.boolean().default(true),
		push  : z.boolean().default(true),
	}).prefault({})
}).refine((request) => !request.to || (request.kind === 'account' && request.ids.length === 1), {
	// Only account mail goes anywhere but the person's own address, and an unsubscribe link can't follow it there
	message: 'A to address is for account mail to exactly one recipient',
	path: ['to'],
}).refine((request) => (request.text === undefined) !== (request.html === undefined), {
	message: 'A message is either text or html',
	path: ['text'],
}).refine((request) => (request.kind !== 'tourn' && request.as !== 'tourn') || request.tourn !== undefined, {
	message: 'Tournament mail names its tourn',
	path: ['tourn'],
}).refine((request) => request.as !== 'person' || request.sender !== undefined, {
	message: 'Mail sent as a person names its sender',
	path: ['sender'],
}).transform((request) => ({
	...request,
	// What a tournament's staff typed never goes out under Tabroom's name unless the caller says so
	as: request.as ?? (request.kind === 'tourn' ? 'tourn' as const : 'tabroom' as const),
}));
/** What a caller passes: everything with a default is optional */
export type NotifyRequest = z.input<typeof NotificationRequestSchema>;
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

export type NotifyResult = {
	/** Message rows written, one per recipient */
	messages: number;
	/** Jobs queued per channel */
	jobs: { push: number; email: number };
};

export type EmailPriority = NotificationRequest['priority'];

/**
 * BullMQ runs jobs added without a priority first, then the lowest number. So high goes in with
 * none and jumps ahead of a blast in progress; low waits behind every other email
 */
const EMAIL_JOB_PRIORITY = { normal: 10, low: 20 } as const;

/** Push without VAPID keys is an environment choice, so it is said once per process, not per notification */
let warnedPushUnconfigured = false;

export class NotificationRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotificationRequestError';
	}
}

/** A notification with its records written and its delivery jobs built, but nothing queued yet */
export type PreparedNotification = {
	/** The message row written for each recipient */
	messages: { id: number; person: number }[];
	/** One delivery job per recipient and channel, ready for addJobs or a caller's flow */
	deliveries: FlowNode[];
};

/**
 * Does everything but queue: validates the request, writes one message row per recipient
 * (their inbox entry and the per-person record of the delivery), and builds a delivery
 * job per recipient for each channel that can reach them. Throws on an invalid request. A caller that wants
 * something to run after every delivery settles adds the deliveries under its own flow
 * parent; notify() queues them as is
 */
export async function prepNotify(input: NotifyRequest): Promise<PreparedNotification> {
	const request = validateNotificationRequest(input);
	if (request.ids.length === 0) return { messages: [], deliveries: [] };

	// The body is stored once as html that is safe to show: text is escaped, and only what
	// EMAIL_HTML allows of staff-typed markup is kept. Html of any other kind is our own
	// templates'. The inbox, the email, and the push all read this, so none of them guesses
	const content = request.html === undefined
		? textToHtml(request.text ?? '').value
		: request.kind === 'tourn' ? sanitizeHTML(request.html, EMAIL_HTML) : request.html;
	// A message linked to a blast's email row shows that row's content, so it only carries
	// a body of its own when there is a footer to add; otherwise the content lives here
	const body = request.emailId && !request.append
		? null
		: content + (request.append ? textToHtml(request.append).value : '');

	// No email job for anyone email can't reach; the job checks again at send time for changes since
	const reachable = request.channels.email
		? await emailRecipients(request.ids, { account: request.kind === 'account', hasAddress: Boolean(request.to) })
		: new Set<number>();

	// No push job for anyone without a login that can receive push, which is most people.
	// Without VAPID keys nobody can, so every push is skipped here and no job runs to say so
	const vapid = getVapid();
	if (request.channels.push && !vapid && !warnedPushUnconfigured) {
		warnedPushUnconfigured = true;
		logger.warn('Push deliveries are being skipped, web push is not configured', {
			'event.name': 'notification.push.unconfigured',
		});
	}
	const pushable = request.channels.push && vapid
		? await sessionRepo.getPushRecipients(db, request.ids, vapid.fingerprint, { sessions: request.push?.sessions })
		: new Set<number>();
	const queuedAt = new Date();

	const messages = await db.insertInto('message')
		.values(request.ids.map((person) => ({
			person,
			email         : request.emailId,
			subject       : request.subject,
			body,
			url           : request.url,
			sender        : request.sender,
			sender_string : request.replyTo,
			tourn         : request.tourn,
			// The inbox shows a message once visible_at has passed and never shows one without it,
			// so the row is still the record of the delivery when the inbox channel is off
			visible_at: request.channels.inbox ? queuedAt : null,
			// Each channel's status starts here: queued until its job settles, or settled
			// already for someone the channel can't reach. A channel that is off stays null
			...(request.channels.email
				? reachable.has(person)
					? { email_status: 'queued' as const }
					: { email_status: 'skipped' as const, emailed_at: queuedAt }
				: {}),
			...(request.channels.push
				? pushable.has(person)
					? { push_status: 'queued' as const }
					: { push_status: 'skipped' as const, pushed_at: queuedAt }
				: {}),
		})))
		.returning(['id', 'person'])
		// every row above has a person
		.$narrowType<{ person: number }>()
		.execute();

	// Deliveries settled above never reach recordDelivery, so they are counted here
	if (request.channels.email) {
		messageRepo.countSkipped('email', messages.filter((message) => !reachable.has(message.person)).length);
	}
	if (request.channels.push) {
		messageRepo.countSkipped('push', messages.filter((message) => !pushable.has(message.person)).length);
	}

	const deliveries: FlowNode[] = [];
	if (request.channels.push) {
		for (const message of messages) {
			if (!pushable.has(message.person)) continue;
			deliveries.push(pushQueue.job('push', { message: message.id, ...(request.push ? { push: request.push } : {}) }, {
				jobId: `message-${message.id}`,
				// Whatever a caller runs after the deliveries still runs when a recipient's push fails
				ignoreDependencyOnFailure: true,
			}));
		}
	}
	if (request.channels.email) {
		for (const message of messages) {
			if (!reachable.has(message.person)) continue;
			deliveries.push(emailQueue.job('email', {
				message: message.id,
				...(request.kind === 'tabroom' ? {} : { kind: request.kind }),
				...(request.as === 'tabroom' ? {} : { as: request.as }),
				...(request.to ? { to: request.to } : {}),
			}, {
				jobId: `message-${message.id}`,
				...(request.priority === 'high' ? {} : { priority: EMAIL_JOB_PRIORITY[request.priority] }),
				ignoreDependencyOnFailure: true,
			}));
		}
	}

	return { messages, deliveries };
}

/**
 * The ids among these people who have an address and have not opted out. Account mail
 * reaches the opted out; a request with its own to address (hasAddress) needs none from the person
 */
async function emailRecipients(ids: number[], opts: { account: boolean; hasAddress: boolean }): Promise<Set<number>> {
	const people = await db.selectFrom('person')
		.select(['id', 'email', 'no_email'])
		.where('id', 'in', ids)
		.execute();

	return new Set(people
		.filter((person) => (opts.hasAddress || person.email.trim() !== '') && (opts.account || !person.no_email))
		.map((person) => person.id));
}

/**
 * Prepares a notification and queues its deliveries. Throws NotificationRequestError on an
 * invalid request, which is a bug in the caller, and whatever the database or the queue throws
 */
export async function notify(input: NotifyRequest): Promise<NotifyResult> {
	const { messages, deliveries } = await prepNotify(input);
	const jobs = {
		push  : deliveries.filter((delivery) => delivery.queueName === 'push').length,
		email : deliveries.filter((delivery) => delivery.queueName === 'email').length,
	};

	try {
		await addJobs(deliveries);
	} catch (error) {
		// The rows are written and say queued, but nothing will ever run for them. Settle them
		// as failed so the inbox entries do not look pending forever and a retried blast is
		// not mistaken for a duplicate. The caller still gets the error
		logger.error(`Could not queue ${jobs.push} push and ${jobs.email} email job(s) for ${messages.length} people`, {
			'event.name': 'notification.enqueue.exception',
			error,
		});
		const settled = await messageRepo.failQueued(db, messages.map((message) => message.id), {
			email: jobs.email > 0,
			push: jobs.push > 0,
		});
		logger.warn(`Marked ${settled.email} email and ${settled.push} push deliveries failed for the jobs that were not queued`, {
			'event.name': 'notification.enqueue.failed_marked',
		});
		throw error;
	}

	logger.info(`Notification recorded for ${messages.length} people, queued ${jobs.push} push and ${jobs.email} email job(s)`);

	return { messages: messages.length, jobs };
}

export function validateNotificationRequest(inputData: unknown) {

	let valid = NotificationRequestSchema.safeParse(inputData);
	if(!valid.success) {
		throw new NotificationRequestError(`Invalid notification request, ${valid.error.message}`);
	}
	return valid.data;
}
