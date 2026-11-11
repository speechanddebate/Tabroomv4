import type { Database } from '../data/database.js';
import { encodeSettingValue, type Settings } from './utils/index.js';

async function getSettings(db: Database, settings: string[]) {
	return await db.selectFrom('tabroom_setting')
		.where('tag', 'in', settings)
		.selectAll()
		.execute();
}

/**
 * Saves a site-wide setting, adding it or replacing what is there, as the person given.
 * The value is stored the way every other setting is, so a list or object goes in value_text
 * as JSON. Not saveSettings: that is for settings that belong to a row, and these have no owner
 */
async function saveSetting(db: Database, tag: string, value: NonNullable<Settings[string]>, person: number) {
	const stored = { person, ...encodeSettingValue(value, tag) };
	await db.insertInto('tabroom_setting')
		.values({ tag, ...stored })
		.onDuplicateKeyUpdate(stored)
		.execute();
}

export default {
	getSettings,
	saveSetting,
};
