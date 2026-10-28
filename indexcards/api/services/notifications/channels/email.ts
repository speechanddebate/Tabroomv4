import { db } from "../../../data/database.js";
import emailBlast from "../../../helpers/mail.js";
import type { notifyResponse, inputData } from "../notify.js";

export async function sendEmailNotification(inputData: inputData): Promise<notifyResponse> {

	if (
		!inputData.ids
		|| inputData.ids.length < 1
		|| (!inputData.text && !inputData.html)
	) {
		return {
			error   : false,
			message : `No web pushes active.`,
			email   : inputData.ids.length,
			inbox   : 0,
			web     : 0,
		};
	}

	const recipients = await db.selectFrom('person')
		.where('person.id', 'in', inputData.ids)
		.select([
			'person.id',
			'person.first',
			'person.last',
			'person.email',
			'person.no_email',
		])
		.execute();

	inputData.email = recipients.filter( (person) => {
		if (inputData.ignoreNoEmail || (!person.no_email)) {
			return person;
		}
		return null;
	}).map( (person) => {
		return person.email;
	});

	const promises: Promise<unknown>[] = [];

	if (inputData.email && inputData.email.length > 0) {
		const promise = emailBlast(inputData);
		promises.push(promise);
	}

	await Promise.all(promises);

	return {
		error   : false,
		message : `${inputData.email.length} emails sent.`,
		email   : inputData.email.length,
		inbox   : 0,
		web     : 0,
	};
}
