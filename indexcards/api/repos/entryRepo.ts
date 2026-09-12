import { flattenSettingsFromJson, settingsRowsJsonSelect } from './utils/settings.js';
import type { Insertable } from 'kysely';
import type { Entry } from '../data/schema.js';

import type { Database } from '../data/database.js';

type entryOpts = {
	limit?: number,
	offset?: number,
	settings?: boolean | string[]
}
function buildEntryQuery(db: Database, opts:entryOpts = {}) {
	let query = db.selectFrom('entry');
	if(opts.limit){
		query = query.limit(opts.limit)
	}
	if(opts.offset){
		query = query.offset(opts.offset)
	}
	if (opts.settings) {
		return query
			.select(
				settingsRowsJsonSelect({
					table: 'entry_setting',
					ownerKey: 'entry',
					ownerRef: 'entry.id',
					settings: opts.settings,
				}).as('settings')
			);
	}
	return query;
}

async function getEntry(db: Database,id: number, opts: entryOpts = {}) {
	const query = buildEntryQuery(db,opts)
	.selectAll('entry')
	.where('entry.id', '=', id);

	const row = await query.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	if (opts.settings) {
		return {
			...row,
			settings: flattenSettingsFromJson((row as { settings?: unknown }).settings),
		};
	}

	return row;
}

async function createEntry(db: Database, data: Insertable<Entry>) {
	return await db.insertInto('entry')
		.values(data)
		.returningAll()
		.executeTakeFirstOrThrow();
}

export default {
	getEntry,
	createEntry,
};
