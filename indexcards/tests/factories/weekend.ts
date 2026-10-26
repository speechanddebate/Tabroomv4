import { faker } from '@faker-js/faker';
import { noMs } from './factoryUtils.js';
import { db } from '../../api/data/database.js';
import type { Weekend } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

const DAY = 24 * 60 * 60 * 1000;

export function createWeekendData(overrides: Partial<Insertable<Weekend>> = {}) {
	const start = overrides.start ? new Date(overrides.start) : noMs(faker.date.recent());
	const before = (days: number) => noMs(new Date(start.getTime() - days * DAY));
	return {
		name: `${faker.location.city()} Weekend`,
		city: faker.location.city(),
		state: faker.location.state({ abbreviated: true }),
		start: noMs(start),
		end: noMs(new Date(start.getTime() + 2 * DAY)),
		reg_start: before(30),
		reg_end: before(7),
		drop_deadline: before(3),
		fine_deadline: before(2),
		freeze_deadline: before(2),
		judge_deadline: before(5),
		...overrides,
	};
}

export async function create(overrides: Partial<Insertable<Weekend>> = {}) {
	const data = createWeekendData(overrides);
	return await db.insertInto('weekend')
		.values(data)
		.returningAll()
		.executeTakeFirstOrThrow();
}

export default {
	createWeekendData,
	create,
};
