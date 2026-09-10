
import { saveSettings, settingsRowsJsonSelect, flattenSettingsFromJson } from './utils/settings.js';

import type { Database } from '../data/database.js';
import type { Category } from '../data/schema.js';
import type { Updateable, Insertable, Selectable } from 'kysely';

type CategoryOpts = {
	settings?: boolean | string[];
};

type CategoryWithSettings = Selectable<Category> & {
	settings: Record<string, unknown>;
};

type CategoryResult<TOpts extends CategoryOpts> =
	TOpts['settings'] extends true | string[]
		? CategoryWithSettings
		: Selectable<Category>;

function wantsSettings(opts: CategoryOpts): opts is CategoryOpts & { settings: true | string[] } {
	return opts.settings === true || Array.isArray(opts.settings);
}

function buildCategoryQuery<TOpts extends CategoryOpts>(db: Database, opts: TOpts) {
	if (wantsSettings(opts)) {
		return db
			.selectFrom('category')
			.selectAll('category')
			.select(
				settingsRowsJsonSelect({
					table: 'category_setting',
					ownerKey: 'category',
					ownerRef: 'category.id',
					settings: opts.settings,
				}).as('settings')
			);
	}

	return db
		.selectFrom('category')
		.selectAll('category');
}

export async function getCategory<TOpts extends CategoryOpts = CategoryOpts>(
	db: Database,
	id: number,
	opts: TOpts = {} as TOpts,
): Promise<CategoryResult<TOpts> | undefined> {
	const query = buildCategoryQuery(db,opts)
	.where('category.id', '=', id);

	const row = await query.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	if (wantsSettings(opts)) {
		return {
			...row,
			settings: flattenSettingsFromJson((row as { settings?: unknown }).settings),
		} as CategoryResult<TOpts>;
	}

	return row as CategoryResult<TOpts>;
}
async function getCategories<TOpts extends CategoryOpts = CategoryOpts>(
	db: Database,
	scope: { tournId?: number } = {},
	opts: TOpts = {} as TOpts,
): Promise<Array<CategoryResult<TOpts>>> {
	let query = buildCategoryQuery(db,opts);
	if (scope?.tournId) {
		query = query.where('category.tourn', '=', scope.tournId);
	}

	const rows = await query.execute();

	if (wantsSettings(opts)) {
		return rows.map((row) => ({
			...row,
			settings: flattenSettingsFromJson((row as { settings?: unknown }).settings),
		})) as Array<CategoryResult<TOpts>>;
	}

	return rows as Array<CategoryResult<TOpts>>;
}
async function createCategory(db: Database, data: Insertable<Category> & { settings?: Record<string, unknown> }, opts = {}) {
	const { settings, ...categoryData } = data;

	return await db.transaction().execute(async (trx) => {
		if (Object.keys(categoryData).length === 0) {
			throw new Error('createCategory requires category data');
		}

		const category = await trx
			.insertInto('category')
			.values(categoryData)
			.returningAll()
			.executeTakeFirstOrThrow();

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'category_setting',
				settings,
				ownerKey: 'category',
				ownerId: category.id,
			});
		}

		return category;
	});
}

async function updateCategory(db: Database, id: number, data: Updateable<Category> & { settings?: Record<string, unknown> }, opts = {}) {
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
				table: 'category_setting',
				settings,
				ownerKey: 'category',
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
