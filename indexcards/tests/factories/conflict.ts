import conflictRepo from '../../api/repos/conflictRepo.js';
import { db } from '../../api/data/database.js';
import type { Conflict } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

export function createConflictData(overrides: Partial<Insertable<Conflict>> = {}): Insertable<Conflict> {
	return {
		added_by: overrides.person,
		...overrides,
	};
}

export async function create(overrides: Partial<Insertable<Conflict>> = {}) {
	return await conflictRepo.createConflict(db, createConflictData(overrides));
}

export default {
	createConflictData,
	create,
};
