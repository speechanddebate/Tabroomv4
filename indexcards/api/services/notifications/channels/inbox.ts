import { db } from "../../../data/database.js";
import logger from "../../../helpers/logger.js";
import type { notifyResponse, inputData } from "../notify.js";

export async function sendInboxNotification(inputData: inputData): Promise<notifyResponse> {

	if (
		!inputData.ids
		|| inputData.ids.length < 1
		|| (!inputData.text && !inputData.html)
	) {
		return {
			error   : false,
			message : `No receipients sent.`,
			email   : 0,
			inbox   : inputData.ids.length,
			web     : 0,
		};
	}

	const message: Record<string, unknown> = {
		body          : inputData.html || inputData.text,
		subject       : inputData.subject,
		sender        : inputData.sender,
		sender_string : inputData.replyTo || inputData.from,
		url           : inputData.url,
		email         : inputData.emailId,
	};

	// Tourn must exist, or otherwise be null
	if (inputData.tourn) {
		message.tourn = inputData.tourn;
	}

	if (message.email && !inputData.append) {
		delete message.body;
	}

	const responses: unknown[] = [];
	const errors: unknown[] = [];

	// TODO: the insert is built but never executed, so no inbox rows are written.
	inputData.ids.forEach( async (id) => {

		try {
			const response = db.insertInto('message')
				.values({
					person: id,
					...message,
				});
			responses.push(response);
		} catch (err) {
			errors.push(err);
		}
	});

	await Promise.all(responses);

	if (errors.length > 1) {

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
		message : `${inputData.ids.length} Tabroom inbox messages delivered.`,
		email   : 0,
		inbox   : inputData.ids.length,
		web     : 0,
	};
}
