import categoryRepo from '../../api/repos/categoryRepo.js';
import { fakeCategory, noMs } from './factoryUtils.js';
import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';
import type { Category } from '../../api/data/schema.js';
import type { Settings } from '../../api/repos/utils/settings.js';
import type { Selectable } from 'kysely';

export function createCategoryData(overrides = {}) {
	const category = fakeCategory();
	return {
		name: category.name,
		abbr: category.abbr + (Math.random().toString(36).substring(2, 6)), // ensure uniqueness
		...overrides,
	};
}

// A category row as a repo returns it with settings, without touching the DB
export function mock(overrides: Partial<Selectable<Category>> & { settings?: Settings | null } = {}): Selectable<Category> & { settings: Settings | null } {
	return {
		id: faker.number.int({ min: 1, max: 1_000_000 }),
		tourn: null,
		pattern: null,
		created_at: noMs(new Date()),
		timestamp: noMs(new Date()),
		...createCategoryData(),
		settings: {},
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createCategoryData(overrides);
	const category = await categoryRepo.createCategory(db,data);

	const res = await categoryRepo.getCategory(db,category.id, { settings: true });
	return res ?? (() => { throw new Error('Failed to create category'); })();
}
export default {
	create,
	createCategoryData,
	mock,
};
