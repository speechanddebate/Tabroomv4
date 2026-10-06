import { faker } from '@faker-js/faker';
import { db } from '../../api/data/database.js';
import { noMs } from './factoryUtils.js';
import type { Fine } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

export function createFineData(overrides: Partial<Insertable<Fine>> = {}): Insertable<Fine> {
	return {
		reason: faker.lorem.sentence().slice(0, 255),
		amount: faker.number.int({ min: 5, max: 200 }),
		levied_at: noMs(faker.date.recent()),
		...overrides,
	};
}

export async function create(overrides: Partial<Insertable<Fine>> = {}) {
	const data = createFineData(overrides);
	const result = await db.insertInto('fine').values(data).executeTakeFirstOrThrow();

	return await db
		.selectFrom('fine')
		.selectAll()
		.where('id', '=', Number(result.insertId))
		.executeTakeFirstOrThrow();
}

export default {
	createFineData,
	create,
};
