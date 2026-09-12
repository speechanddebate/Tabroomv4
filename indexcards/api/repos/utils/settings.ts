import logger from '../../helpers/logger.js';
import { sql } from 'kysely';


import type { Database } from '../../data/database.js';

type Settings = Record<string, unknown>;
type FlattenedSettings = Record<string, string | number | Date | null>;
type SettingsTable = 'person_setting' | 'category_setting' | 'round_setting' | 'event_setting' | 'entry_setting';
type SettingsOwnerKey<T extends SettingsTable> =
	T extends 'person_setting' ? 'person'
		: T extends 'category_setting' ? 'category'
			: T extends 'round_setting' ? 'round'
				: T extends 'event_setting' ? 'event'
				: 'entry';
type SettingsOwnerKeyValue = 'person' | 'category' | 'round' | 'event' | 'entry';

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
	table: 'person_setting' | 'category_setting' | 'round_setting' | 'event_setting' | 'entry_setting;'
	settings: Settings;
	ownerKey: string;
	ownerId: number;
}

export async function saveSettings({
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

	const out: FlattenedSettings = {};

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

export function settingsRowsJsonSelect({
	table,
	ownerKey,
	ownerRef,
	settings,
}: {
	table: SettingsTable;
	ownerKey: SettingsOwnerKeyValue;
	ownerRef: string;
	settings: true | string[];
}) {
	const tags = Array.isArray(settings) ? settings : undefined;
	const tagFilter = tags?.length
		? sql` AND s.tag IN (${sql.join(tags)})`
		: sql``;

	return sql<string | null>`(
		SELECT JSON_OBJECTAGG(
			s.tag,
			CASE
				WHEN s.value = 'date' THEN s.value_date
				WHEN s.value = 'text' THEN s.value_text
				WHEN s.value = 'json' AND JSON_VALID(s.value_text) THEN JSON_EXTRACT(s.value_text, '$')
				WHEN s.value = 'json' THEN s.value_text
				ELSE s.value
			END
		)
		FROM ${sql.table(table)} s
		WHERE ${sql.ref(`s.${ownerKey}`)} = ${sql.ref(ownerRef)}
		${tagFilter}
	)`;
}

export function flattenSettingsFromJson(settingRowsJson: unknown): FlattenedSettings {
	if (!settingRowsJson) {
		return {};
	}

	try {
		let parsed: unknown;

		if (typeof settingRowsJson === 'string') {
			parsed = JSON.parse(settingRowsJson);
		} else if (settingRowsJson instanceof Uint8Array) {
			parsed = JSON.parse(Buffer.from(settingRowsJson).toString('utf8'));
		} else {
			parsed = settingRowsJson;
		}

		// Legacy shape: [{ tag, value, value_text, value_date, ... }]
		if (Array.isArray(parsed)) {
			const settingRows: SettingRow[] = parsed.map((row) => {
				const payload = row as Record<string, unknown>;
				return {
					tag: typeof payload.tag === 'string' ? payload.tag : '',
					value: typeof payload.value === 'string' || payload.value === null ? payload.value : String(payload.value),
					value_text: typeof payload.value_text === 'string' || payload.value_text === null ? payload.value_text : String(payload.value_text),
					value_date: payload.value_date ? new Date(String(payload.value_date)) : null,
					created_at: payload.created_at ? new Date(String(payload.created_at)) : null,
					timestamp: payload.timestamp ? new Date(String(payload.timestamp)) : null,
				};
			}).filter((row) => row.tag.length > 0);

			return flattenSettings(settingRows) ?? {};
		}

		// Optimized shape: { [tag]: { value, value_text, value_date } }
		if (parsed && typeof parsed === 'object') {
			const entries = Object.entries(parsed as Record<string, unknown>);

			// Most optimized shape: { [tag]: resolvedScalarOrJson }
			if (entries.every(([, row]) => row === null || typeof row !== 'object' || row instanceof Date)) {
				return Object.fromEntries(entries) as FlattenedSettings;
			}

			const settingRows: SettingRow[] = entries.map(([tag, row]) => {
				const payload = (row && typeof row === 'object')
					? (row as Record<string, unknown>)
					: {};
				return {
					tag,
					value: typeof payload.value === 'string' || payload.value === null ? payload.value : String(payload.value ?? ''),
					value_text: typeof payload.value_text === 'string' || payload.value_text === null ? payload.value_text : String(payload.value_text ?? ''),
					value_date: payload.value_date ? new Date(String(payload.value_date)) : null,
					created_at: null,
					timestamp: null,
				};
			}).filter((row) => row.tag.length > 0);

			return flattenSettings(settingRows) ?? {};
		}

		return {};
	} catch (error) {
		logger.warn('Failed to parse settings JSON payload:', error);
		return {};
	}
}

export async function attachSettingsToRows<
	TRow extends Record<string, unknown>,
	TTable extends SettingsTable,
	TRowIdKey extends keyof TRow,
>({
	db,
	rows,
	table,
	ownerKey,
	rowIdKey,
	tags,
	settingsKey = 'settings',
}: {
	db: Database;
	rows: TRow[];
	table: TTable;
	ownerKey: SettingsOwnerKey<TTable>;
	rowIdKey: TRowIdKey;
	tags?: string[];
	settingsKey?: string;
}): Promise<Array<TRow & { settings: FlattenedSettings }>> {
	if (!rows.length) {
		return [];
	}

	const ids = rows
		.map(row => Number(row[rowIdKey]))
		.filter(id => Number.isInteger(id));

	if (!ids.length) {
		return rows.map(row => ({
			...row,
			[settingsKey]: {},
		})) as Array<TRow & { settings: FlattenedSettings }>;
	}

	let settingRows: Array<Record<string, unknown>> = [];

	if (table === 'person_setting') {
		let query = db
			.selectFrom('person_setting')
			.selectAll()
			.where('person', 'in', ids);

		if (tags?.length) {
			query = query.where('tag', 'in', tags);
		}

		settingRows = await query.execute();
	} else if (table === 'category_setting') {
		let query = db
			.selectFrom('category_setting')
			.selectAll()
			.where('category', 'in', ids);

		if (tags?.length) {
			query = query.where('tag', 'in', tags);
		}

		settingRows = await query.execute();
	} else if (table === 'round_setting') {
		let query = db
			.selectFrom('round_setting')
			.selectAll()
			.where('round', 'in', ids);

		if (tags?.length) {
			query = query.where('tag', 'in', tags);
		}

		settingRows = await query.execute();
	} else {
		let query = db
			.selectFrom('event_setting')
			.selectAll()
			.where('event', 'in', ids);

		if (tags?.length) {
			query = query.where('tag', 'in', tags);
		}

		settingRows = await query.execute();
	}
	const settingsByOwner = new Map<number, SettingRow[]>();

	for (const row of settingRows) {
		const ownerId = Number(row[ownerKey] as unknown);
		if (!Number.isInteger(ownerId) || typeof row.tag !== 'string') {
			continue;
		}

		const arr = settingsByOwner.get(ownerId);
		if (arr) {
			arr.push(row as SettingRow);
		} else {
			settingsByOwner.set(ownerId, [row as SettingRow]);
		}
	}

	return rows.map(row => {
		const ownerId = Number(row[rowIdKey]);
		const ownerRows = settingsByOwner.get(ownerId) ?? [];
		return {
			...row,
			[settingsKey]: flattenSettings(ownerRows) ?? {},
		};
	}) as Array<TRow & { settings: FlattenedSettings }>;
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
