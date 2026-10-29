import { db } from "../../../data/database.js";
import emailBlast from "../../../helpers/mail.js";
import type { notifyResponse, NotificationRequest } from "../notify.js";

export async function sendEmailNotification(notification: NotificationRequest): Promise<notifyResponse> {

	const recipients = await db.selectFrom('person')
		.where('person.id', 'in', notification.ids)
		.select([
			'person.id',
			'person.first',
			'person.last',
			'person.email',
			'person.no_email',
		])
		.execute();

	notification.email = recipients.filter( (person) => {
		if (notification.ignoreNoEmail || (!person.no_email)) {
			return person;
		}
		return null;
	}).map( (person) => {
		return person.email;
	});

	const promises: Promise<unknown>[] = [];

	if (notification.email && notification.email.length > 0) {
		const promise = emailBlast(notification);
		promises.push(promise);
	}

	await Promise.all(promises);

	return {
		error   : false,
		message : `${notification.email.length} emails sent.`,
		email   : notification.email.length,
		inbox   : 0,
		web     : 0,
	};
}
