import { db } from '../../api/data/database.js';
import type { Region } from '../../api/data/schema.js';
import { fakeRegionName } from './factoryUtils.js';
import type { Insertable } from 'kysely';

export function createRegionData(overrides: Partial<Insertable<Region>> = {}): Insertable<Region> {
	return {
		name: fakeRegionName(),
		...overrides,
	};
}

export async function create(overrides: Partial<Insertable<Region>> = {}) {
	const data = createRegionData(overrides);
	const result = await db.insertInto('region').values(data).executeTakeFirstOrThrow();

	return await db
		.selectFrom('region')
		.selectAll()
		.where('id', '=', Number(result.insertId))
		.executeTakeFirstOrThrow();
}

export default {
	createRegionData,
	create,
};
