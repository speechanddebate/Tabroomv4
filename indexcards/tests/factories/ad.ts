import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';

export function createAdData(overrides = {}) {
	return {
		filename: faker.system.commonFileName('jpg'),
		url: faker.internet.url(),
		start: faker.date.past(),
		end: faker.date.future(),
		background: faker.color.rgb(),
		person: 1,
		approved_by: 1,
		approved: 1,
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createAdData(overrides);
	return await db.insertInto('ad').values(data).returning('id').executeTakeFirst();
}
export default {
	createAdData,
	create,
};