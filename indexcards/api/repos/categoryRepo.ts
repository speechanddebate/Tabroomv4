
import { saveSettings, selectSettings } from './utils/settings.js';

import type { Database } from '../data/database.js';
import type { Category } from '../data/schema.js';
import type { Updateable, Insertable } from 'kysely';
import type { Settings } from './utils/settings.js';

type CategoryOpts = {
	tourn?: number;
	settings?: boolean | string[];
};

function buildCategoryQuery<TOpts extends CategoryOpts>(db: Database, opts: TOpts) {
	let query = db.selectFrom('category')
	.$if(opts.settings !== undefined && opts.settings !== false, (q) => q.select(selectSettings({
		table: 'category',
		settings: opts.settings!,
	})))
	if(opts.tourn) query = query.where('category.tourn', '=', opts.tourn);
	return query;
}

export async function getCategory(db: Database, id: number, opts: CategoryOpts = {}) {
	const query = buildCategoryQuery(db,opts)
	.where('category.id', '=', id);
	return await query.selectAll('category').executeTakeFirst();
}
async function getCategories(db: Database, opts: CategoryOpts = {}) {
	return await buildCategoryQuery(db,opts)
		.selectAll('category')
		.execute();
}
async function createCategory(db: Database, data: Insertable<Category> & { settings?: Settings }) {
	const { settings, ...categoryData } = data;
	return await db.transaction().execute(async (trx) => {
		const category = await trx
			.insertInto('category')
			.values(categoryData)
			.returningAll()
			.executeTakeFirstOrThrow();

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'category',
				settings,
				ownerId: category.id,
			});
		}
		return category;
	});
}

async function updateCategory(db: Database, id: number, data: Updateable<Category> & { settings?: Settings }) {
	const { settings, ...categoryData } = data;

	return await db.transaction().execute(async (trx) => {
		if (Object.keys(categoryData).length > 0) {
			await trx
				.updateTable('category')
				.set(categoryData)
				.where('id', '=', id)
				.executeTakeFirstOrThrow();
		}

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'category',
				settings,
				ownerId: id,
			});
		}

		return id;
	});
}
async function deleteCategory(db: Database, id: number) {
	const res = await db.deleteFrom('category')
		.where('id', '=', id)
		.executeTakeFirst();
	return Number(res.numDeletedRows);
}

export default {
	getCategory,
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
};
