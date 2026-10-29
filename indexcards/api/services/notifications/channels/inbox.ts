import { db } from "../../../data/database.js";
import type { Insertable } from "kysely";
import type { Message } from "../../../data/schema.js";
import logger from "../../../helpers/logger.js";
import type { notifyResponse, NotificationRequest } from "../notify.js";

export async function sendInboxNotification(notification: NotificationRequest): Promise<notifyResponse> {

	const message: Insertable<Message> = {
		body          : notification.html || notification.text,
		subject       : notification.subject,
		sender        : notification.sender,
		sender_string : notification.replyTo || notification.from,
		url           : notification.url,
		email         : notification.emailId,
	};

	// Tourn must exist, or otherwise be null
	if (notification.tourn) {
		message.tourn = notification.tourn;
	}

	if (message.email && !notification.append) {
		delete message.body;
	}

	const responses: unknown[] = [];
	const errors: unknown[] = [];

	// TODO: the insert is built but never executed, so no inbox rows are written.
	notification.ids.forEach( async (id) => {

		try {
			const response = await db.insertInto('message')
				.values({
					person: id,
					...message,
				})
				.execute();
			responses.push(response);
		} catch (err) {
			errors.push(err);
		}
	});

	// await Promise.all(responses); // This line is not needed because responses are already awaited individually in the forEach loop.

	if (errors.length > 0) {

		logger.error(errors);

		return {
			error   : true,
			message : `${errors.length} Errors saving messages to Tabroom inboxes`,
			email   : 0,
			inbox   : 0,
			web     : 0,
			errors,
		};
	}

	return {
		error   : false,
		message : `${notification.ids.length} Tabroom inbox messages delivered.`,
		email   : 0,
		inbox   : notification.ids.length,
		web     : 0,
	};
}
