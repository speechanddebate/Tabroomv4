import logger from '../../helpers/logger.js';
import { sql } from 'kysely';


import type { Database } from '../../data/database.js';

type Settings = Record<string, unknown>;

type SettingRow = {
	value: string | null;
	value_text: string | null;
	value_date: Date | null;
	tag: string;
	created_at: Date | null;
	timestamp: Date | null;
};

interface SaveSettingsOptions {
	db: Database;
	table: 'person_setting'; // expand this later
	settings: Settings;
	ownerKey: string;
	ownerId: number;
}

export async function saveSettings2({
	db,
	table,
	settings,
	ownerKey,
	ownerId,
}: SaveSettingsOptions) {
	if (!settings || !Object.keys(settings).length) {
		return;
	}

	const rows = buildSettingsRows({
		settings,
		ownerKey,
		ownerId,
	});

	if (!rows.length) {
		return;
	}

	await db
		.insertInto(table)
		.values(rows)
		.onDuplicateKeyUpdate({
			value: sql`VALUES(value)`,
			value_text: sql`VALUES(value_text)`,
			value_date: sql`VALUES(value_date)`,
		})
		.execute();
}
export async function saveSettings({
	model,
	settings,
	ownerKey,
	ownerId,
}: {
	// sequelize has horrible typing
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	model: any;
	settings: Settings;
	ownerKey: string;
	ownerId: number;
}) {
	if (!settings || !Object.keys(settings).length) {
		return;
	}

	const rows = buildSettingsRows({
		settings,
		ownerKey,
		ownerId,
	});

	if (!rows.length) {
		return;
	}

	const createdRows =await model.bulkCreate(rows, {
		updateOnDuplicate : [
			'value',
			'value_text',
			'value_date',
		],
	});
	return createdRows;
}

/**
 * Build a Sequelize include for settings based on requested settings tags
 */
export function withSettingsInclude({
	model,
	as,
	settings,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	model: any;
	as: string;
	settings: true | string[];
}) {
	// no settings requested => no include
	if (!settings) return [];

	const include = {
		model,
		as,
		required: false,
		where: {},
	};

	// true = include all settings
	if (settings === true) {
		return [include];
	}

	// array = include only specific tags
	if (Array.isArray(settings)) {
		include.where = {
			tag: settings,
		};
		return [include];
	}

	throw new Error(
		`settings must be true or an array of tags`
	);
}

/**
 * Build rows for bulk upsert into a *_setting table
 */
export function buildSettingsRows({
	settings,
	ownerKey,
	ownerId,
}: {
	settings: Settings;
	ownerKey: string;
	ownerId: number;
}) {
	if (!settings || typeof settings !== 'object') return [];

	return Object.entries(settings).map(([tag, value]) => ({
		[ownerKey]: ownerId,
		tag,
		...encodeSettingValue(value, tag),
	}));
}
/**
 * converts setting rows from DB into a simple key-value object
 * @param {Array} settingRows - rows from DB
 * @returns {Object} settings key-value pairs
 */
export function flattenSettings(settingRows: SettingRow[]) {
	if (!settingRows) return;

	const out: Record<string, string | number | Date | null> = {};

	for (const setting of settingRows) {

		if (setting.value === 'text' || setting.value === 'json') {
			if(setting.value === 'json') {
				try {
					out[setting.tag] = JSON.parse(setting.value_text ?? 'null');
				} catch (e) {
					logger.warn(`Failed to parse JSON setting for tag ${setting.tag} with value ${setting.value_text}:`, e);
					out[setting.tag] = setting.value_text;
				}
			} else {
				out[setting.tag] = setting.value_text;
			}
			continue;
		}

		if (setting.value === 'date') {
			out[setting.tag] = setting.value_date;
			continue;
		}

		// default column: try number, fall back to string
		if (setting.value !== null && setting.value !== undefined) {
			const num = Number(setting.value);
			out[setting.tag] = Number.isNaN(num)
				? setting.value
				: num;
		} else {
			out[setting.tag] = setting.value;
		}
	}

	return out;
}
/**
 * Converts setting rows from DB into an object mapping tag to { createdAt, updatedAt }
 * @param {Array} settingRows - rows from DB
 * @returns {Object} { tag: { createdAt, updatedAt }, ... }
 */
export function flattenSettingsTimestamps(settingRows: SettingRow[]) {
	if (!settingRows) return;

	const out: Record<string, { created_at: Date | null; timestamp: Date | null }> = {};

	for (const setting of settingRows) {
		out[setting.tag] = {
			created_at: setting.created_at,
			timestamp: setting.timestamp,
		};
	}

	return out;
}

/**
 *  converts a setting value into appropriate DB fields
 * @param {*} value  - the setting value
 * @returns an object with keys: value, value_text, value_date
 */
function encodeSettingValue(value: unknown, tag: string) {
	const VALUE_TEXT_TAGS = ['livedoc_url'];
	// null / undefined -> clear all value fields
	if (value === null || value === undefined) {
		return {
			value: null,
			value_text: null,
			value_date: null,
		};
	}

	// Date → value_date
	if (value instanceof Date) {
		return {
			value: 'date',
			value_text: null,
			value_date: value,
		};
	}

	// Boolean → string
	if (typeof value === 'boolean') {
		return {
			value: value ? '1' : '0',
			value_text: null,
			value_date: null,
		};
	}

	// Number → string
	if (typeof value === 'number') {
		return {
			value: String(value),
			value_text: null,
			value_date: null,
		};
	}

	// String → value or value_text
	if (typeof value === 'string') {
		if (value.length <= 64 && !VALUE_TEXT_TAGS.includes(tag)) {
			return {
				value,
				value_text: null,
				value_date: null,
			};
		}

		return {
			value: 'text',
			value_text: value,
			value_date: null,
		};
	}

	// Object / Array → JSON in value_text
	return {
		value: 'json',
		value_text: JSON.stringify(value),
		value_date: null,
	};
}
