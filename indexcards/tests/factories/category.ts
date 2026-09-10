import categoryRepo from '../../api/repos/categoryRepo.js';
import { fakeCategory } from './factoryUtils.js';
import { db } from '../../api/data/database.js';

export function createCategoryData(overrides = {}) {
	const category = fakeCategory();
	return {
		name: category.name,
		abbr: category.abbr + (Math.random().toString(36).substring(2, 6)), // ensure uniqueness
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
};