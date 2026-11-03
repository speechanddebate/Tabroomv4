import { db } from '../../api/data/database.js';
import type { Strike } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

export function createStrikeData(overrides: Partial<Insertable<Strike>> = {}): Insertable<Strike> {
	return {
		type: 'school',
		conflict: 1,
		registrant: 1,
		...overrides,
	};
}

export async function create(overrides: Partial<Insertable<Strike>> = {}) {
	const data = createStrikeData(overrides);
	const result = await db.insertInto('strike').values(data).executeTakeFirstOrThrow();

	return await db
		.selectFrom('strike')
		.selectAll()
		.where('id', '=', Number(result.insertId))
		.executeTakeFirstOrThrow();
}

export default {
	createStrikeData,
	create,
};
