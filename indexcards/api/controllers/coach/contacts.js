import { NotFound } from '../../helpers/problem.js';
import { sql } from 'kysely';
import { db } from '../../data/database.js';

// Contact columns that updateContact may change via property_name
const CONTACT_PROPERTIES = ['book', 'email', 'nsda', 'official', 'onsite'];

const findContacts = (req) => db.selectFrom('contact')
	.selectAll()
	.where('school', '=', parseInt(req.body.school))
	.where('person', '=', parseInt(req.body.person))
	.execute();

// General CRUD for contact coaches
export async function updateContact(req, res) {
	const firstStatusCheck = await checkContactStatus(req);
	const contacts = await findContacts(req);
	if (!contacts || contacts.length < 1) {
		return res.status(200).json('No coach found');
	}
	const contact = contacts.shift();
	for (const dupe of contacts) {
		await db.deleteFrom('contact').where('id', '=', dupe.id).execute();
	}
	if (CONTACT_PROPERTIES.includes(req.body.property_name)) {
		contact[req.body.property_name] = req.body.property_value;
		await db.updateTable('contact')
			.set({ [req.body.property_name]: req.body.property_value })
			.where('id', '=', contact.id)
			.execute();
	}
	const secondStatusCheck = await checkContactStatus(req, res);
	if ((secondStatusCheck === 'OK' || firstStatusCheck === 'OK') && (secondStatusCheck !== firstStatusCheck)) {
		return res.status(200).json({
			message: `Coach is now marked as ${req.body.property_name}`,
			refresh: 1,
			error: false,
		});
	}
	if (secondStatusCheck !== 'OK') {
		return res.status(200).json({
			message: `Coach is now marked as ${req.body.property_name}`,
			error: false,
			replace: [
				{ id: 'contt_errors', content: secondStatusCheck.join('<br />') },
			],
		});
	}
	if (contact[req.body.property_name]) {
		return res.status(200).json(`Coach is now marked as ${req.body.property_name}`);
	}
	return res.status(200).json(`Coach is no longer marked as ${req.body.property_name}`);
}

// I find it rather absurdly dumb that you can't post a body to a DELETE.  I mean,
// what's the point of having these verbs if you're not going to be able to use them
// half the time?

export async function deleteContact(req, res) {
	const firstStatusCheck = await checkContactStatus(req, res);
	const contacts = await findContacts(req);
	for (const contact of contacts) {
		await db.deleteFrom('contact').where('id', '=', contact.id).execute();
	}
	const secondStatusCheck = await checkContactStatus(req, res);
	if (secondStatusCheck !== firstStatusCheck) {
		return res.status(200).json({
			message: `Coach is now marked as ${req.body.property_name}`,
			refresh: 1,
			error: false,
		});
	}
	return res.status(200).json({
		message: `Coach removed for your roster`,
		error: false,
	});
}

export const checkContacts = {

	POST: async (req, res) => {

		const status = await checkContactStatus(req);

		if (status === 'OK') {
			return res.status(200).json('Contacts are OK');
		}

		return res.status(200).json({
			error: true,
			message: status.join('<br/>'),
		});
	},
};

export const checkContactStatus = async (req) => {

	let limit = sql``;

	if (req.body.email_contacts) {
		limit = sql`and contact.email = 1`;
	}

	const { rows: contacts } = await sql`
		select
			contact.id contact_id,
			contact.created_by,
			contact.onsite, contact.official, contact.email, contact.book,
			person.id person_id, person.first, person.middle, person.last,
			person.email email_address,
			person.nsda, diamonds.value diamonds, hof.value hof,
			person.phone, person.no_email,
			second_adult.value secondAdult

		from (person, contact, school)
			left join person_setting diamonds on diamonds.tag = 'diamonds' and diamonds.person = person.id
			left join person_setting hof on hof.tag = 'hof' and hof.person = person.id
			left join tourn_setting second_adult
				on second_adult.tourn = school.tourn
				and second_adult.tag = 'second_adult_contact'

		where person.id = contact.person
			and contact.school = school.id
			and school.id = ${req.body.school || req.params.schoolId}
			${limit}

		order by contact.official DESC, person.last, person.first, person.nsda
	`.execute(db);

	if (req.body.return) {
		return contacts;
	}

	const contactOk = {
		onsiteOffical : false,
		onsiteEmail   : false,
		official      : 0,
	};

	let secondAdult = 'false';

	for await (const contact of contacts) {

		if (contact.secondAdult) {
			secondAdult = true;
		}

		if (
			contact.onsite
			&& contact.official
			&& contact.phone
		) {
			contactOk.onsiteOfficial = true;
		}

		if (contact.phone && contact.official) {
			contactOk.official++;
		}

		if (
			contact.onsite
			&& contact.email
			&& (contact.no_email !== 1)
		) {
			contactOk.onsiteEmail = true;
		}

	}

	const contactErrs = [];

	if (!contactOk.onsiteOfficial) {
		contactErrs.push('At least one contact must be on-site and have a phone number in Tabroom');
	}

	if (!contactOk.onsiteEmail) {
		contactErrs.push('At least one on-site contact must receive tournament emails');
	}

	let adultCount = 1;
	let plural = '';
	if (secondAdult) {
		adultCount++;
		plural = 's';
	}

	if (contactOk.official < adultCount) {
		contactErrs.push(`At least ${adultCount} official school contact${plural} must be listed and you have ${contactOk.official}`);
	}

	if (contactErrs.length > 0) {
		return contactErrs;
	}

	return ('OK');
};

export async function userProfile(req, res) {
	if (!req.person) {
		return res.status(201).json({ message: 'You have no active user session' });
	}
	let personId;
	if (req.params.personId && req.person.site_admin) {
		personId = req.params.personId;
	} else if (req.params.personId) {
		return res.status(201).json({ message: 'Only admin staff may access another profile' });
	} else if (req.person.id) {
		personId = req.person.id;
	}
	const result = personId
		? await db.selectFrom('person').selectAll().where('id', '=', personId).executeTakeFirst()
		: undefined;
	if (!result) {
		return NotFound(req, res, 'User does not exist');
	}
	const Settings = await db.selectFrom('person_setting')
		.selectAll()
		.where('person', '=', result.id)
		.execute();
	const jsonOutput = { ...result, Settings };
	delete jsonOutput.password;
	return res.status(200).json(jsonOutput);
}

export default updateContact;
