import { db } from '../../api/data/database.js';
import { create as createSchool } from './school.js';
import { create as createPerson } from './person.js';
import type { Contact } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

const data = async (props: Partial<Insertable<Contact>> = {}) => {
	const school =
    props.school ??
    (await createSchool()).id;

	const person =
    props.person ??
    (await createPerson()).id;

	return {
		school,
		person,
		...props, // allow overrides last
	};
};

async function create(overrides: Partial<Insertable<Contact>> = {}) {
	return await db.insertInto('contact')
	.values(await data(overrides))
	.returningAll()
	.execute();
}
export default { create };