import { faker } from '@faker-js/faker';
import { db } from '../../api/data/database.js';
import { saveSettings, type Settings } from '../../api/repos/utils/index.js';
import type { Jpool } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

type JpoolOverrides = Partial<Insertable<Jpool>> & {
	settings?: Settings;
	/** judge ids to put in the pool */
	judges?: number[];
};

export function createJpoolData(overrides: Partial<Insertable<Jpool>> = {}): Insertable<Jpool> {
	return {
		name: `${faker.helpers.arrayElement(['Prelim', 'Elim', 'Friday', 'Saturday'])} ${faker.word.noun()} pool`,
		...overrides,
	};
}

export async function create(overrides: JpoolOverrides = {}) {
	const { settings, judges, ...jpoolOverrides } = overrides;
	const data = createJpoolData(jpoolOverrides);
	const result = await db.insertInto('jpool').values(data).executeTakeFirstOrThrow();
	const id = Number(result.insertId);

	if (settings) {
		await saveSettings({ db, table: 'jpool', settings, ownerId: id });
	}
	if (judges?.length) {
		await db.insertInto('jpool_judge')
			.values(judges.map((judge) => ({ jpool: id, judge })))
			.execute();
	}

	return await db
		.selectFrom('jpool')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirstOrThrow();
}

export default {
	createJpoolData,
	create,
};
