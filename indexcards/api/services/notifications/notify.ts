import { z } from "zod";
import { getQueue } from "../queue/index.js";
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
	emailId?       : number
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
}

export async function notify(inputData: inputData): Promise<notifyResponse> {
	let request: NotificationRequest;

	inputData.ids = inputData.ids.filter((value, index, array) => array.indexOf(value) === index);

	try {
		request = NotificationRequestSchema.parse(inputData);
	} catch (error) {
		return {
			error   : true,
			message : `Invalid notification request, ${(error as Error).message}`,
			email   : 0,
			inbox   : 0,
			web     : 0,
			errors  : [(error as Error).message]
		}
	}

	// TODO: insert the notify row and queue its id instead of the recipients
	const job = await getQueue('notify').add('notify', { ids: request.ids });
	return {
		error   : false,
		message : `Queued notification job ${job.id} for ${request.ids.length} people`,
		email   : 0,
		inbox   : 0,
		web     : 0,
	};
}

export function validateNotificationRequest(inputData: unknown) {

	let valid = NotificationRequestSchema.safeParse(inputData);
	if(!valid.success) {
		throw new Error(`Invalid notification request, ${valid.error.message}`);
	} 
	return valid.data;
}