import { z } from "zod";
import { db } from "../../data/database.js";
import logger from "../../helpers/logger.js";
import { addJobs, type FlowNode } from "../queue/index.js";
import { emailQueue, pushQueue } from "./queues.js";

export type inputData = {
	ids     : number[]
	text    : string // Text of the message to send
	subject? : string // Subject line of the emails/blasts.  Optional.
	url?     : string // URL appended to the email or where the click-through of
			  // notification lands.  Optional.
	append?  : string // Text appended to the message as a footer. Optional.
	html?          : string
	sender?        : number
	from?          : string
	replyTo?       : string
	emailId?       : number // The blast's email row, when the caller recorded one
	tourn?         : number
	email?         : string[]
	ignoreNoEmail? : boolean
	channels: {
		inbox? : boolean
		email? : boolean
		webpush?   : boolean
	}
}
/**
 * represents a valid notification request that can be delivered
 */
export const NotificationRequestSchema = z.object({
	ids     : z.array(z.number()).nonempty().refine((arr) => arr.every((v, i, a) => a.indexOf(v) === i), {
		message: "IDs must be unique"
	}),
	text    : z.string().max(65535), //mariadb text limit
	subject : z.string().max(255).nullable(),
	body    : z.string().nullable(),
	url     : z.string().max(511).nullable(),
	append  : z.string().optional(),
	html          : z.string().optional(),
	sender        : z.number().optional(),
	from          : z.string().optional(),
	replyTo       : z.string().optional(),
	emailId       : z.number().optional(),
	tourn         : z.number().optional(),
	email         : z.array(z.string()).optional(),
	ignoreNoEmail  : z.boolean().optional(),
	channels: z.object({
		inbox : z.boolean().default(false),
		email : z.boolean().default(false),
		webpush   : z.boolean().default(false),
	}).prefault({})
});
export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;

export type notifyResponse = {
	error   : boolean
	message : string
	email   : number
	inbox   : number
	web     : number
	errors? : unknown[]
	/** Jobs queued per channel */
	jobs?   : { push: number; email: number }
}

/**
 * Email jobs yield to anything added without a priority, so the transactional mail that
 * comes later (password resets, confirmations) jumps ahead of a blast in progress
 */
const EMAIL_JOB_PRIORITY = 10;

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
 * job per recipient and channel. Throws on an invalid request. A caller that wants
 * something to run after every delivery settles adds the deliveries under its own flow
 * parent; notify() queues them as is
 */
export async function prepNotify(inputData: inputData): Promise<PreparedNotification> {
	inputData.ids = inputData.ids.filter((value, index, array) => array.indexOf(value) === index);
	const request = validateNotificationRequest(inputData);

	// A message linked to a blast's email row shows that row's content, so it only carries
	// a body of its own when there is a footer to add; otherwise the content lives here
	const content = request.html || request.text;
	const body = request.emailId && !request.append
		? null
		: request.append ? `${content}\n${request.append}` : content;

	const messages = await db.insertInto('message')
		.values(request.ids.map((person) => ({
			person,
			email         : request.emailId,
			subject       : request.subject,
			body,
			url           : request.url,
			sender        : request.sender,
			sender_string : request.replyTo || request.from,
			tourn         : request.tourn,
			// The inbox shows a message once visible_at has passed and never shows one without it,
			// so the row is still the record of the delivery when the inbox channel is off
			visible_at: request.channels.inbox ? new Date() : null,
		})))
		.returning(['id', 'person'])
		// every row above has a person
		.$narrowType<{ person: number }>()
		.execute();

	const deliveries: FlowNode[] = [];
	if (request.channels.webpush) {
		for (const message of messages) {
			deliveries.push(pushQueue.job('push', { message: message.id }, {
				jobId: `message-${message.id}`,
				// Whatever a caller runs after the deliveries still runs when a recipient's push fails
				ignoreDependencyOnFailure: true,
			}));
		}
	}
	if (request.channels.email) {
		// No job for anyone email can't reach; the job checks again at send time for changes since
		const reachable = await emailRecipients(request.ids, request.ignoreNoEmail === true);
		for (const message of messages) {
			if (!reachable.has(message.person)) continue;
			deliveries.push(emailQueue.job('email', {
				message: message.id,
				...(request.ignoreNoEmail ? { ignoreNoEmail: true } : {}),
			}, {
				jobId: `message-${message.id}`,
				priority: EMAIL_JOB_PRIORITY,
				ignoreDependencyOnFailure: true,
			}));
		}
	}

	return { messages, deliveries };
}

/** The ids among these people who have an address and have not opted out (or all with one, for account mail) */
async function emailRecipients(ids: number[], ignoreNoEmail: boolean): Promise<Set<number>> {
	const people = await db.selectFrom('person')
		.select(['id', 'email', 'no_email'])
		.where('id', 'in', ids)
		.execute();

	return new Set(people
		.filter((person) => person.email.trim() !== '' && (ignoreNoEmail || !person.no_email))
		.map((person) => person.id));
}

/**
 * Prepares a notification and queues its deliveries. Returns an error response rather
 * than throwing on an invalid request, for the callers that read it that way
 */
export async function notify(inputData: inputData): Promise<notifyResponse> {
	let prepared: PreparedNotification;
	try {
		prepared = await prepNotify(inputData);
	} catch (error) {
		if (!(error instanceof NotificationRequestError)) throw error;
		return {
			error   : true,
			message : error.message,
			email   : 0,
			inbox   : 0,
			web     : 0,
			errors  : [error.message],
		};
	}
	const { messages, deliveries } = prepared;

	await addJobs(deliveries);

	const jobs = {
		push  : deliveries.filter((delivery) => delivery.queueName === 'push').length,
		email : deliveries.filter((delivery) => delivery.queueName === 'email').length,
	};
	logger.info(`Notification recorded for ${messages.length} people, queued ${jobs.push} push and ${jobs.email} email job(s)`);

	return {
		error   : false,
		message : `Notification queued for ${messages.length} people`,
		email   : jobs.email,
		inbox   : messages.length,
		web     : 0,
		jobs,
	};
}

export function validateNotificationRequest(inputData: unknown) {

	let valid = NotificationRequestSchema.safeParse(inputData);
	if(!valid.success) {
		throw new NotificationRequestError(`Invalid notification request, ${valid.error.message}`);
	}
	return valid.data;
}
