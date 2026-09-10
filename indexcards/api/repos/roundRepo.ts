import { saveSettings, settingsRowsJsonSelect, flattenSettingsFromJson } from './utils/settings.js';

import type { Database } from '../data/database.js';
import type { Round } from '../data/schema.js';
import type { Insertable, Selectable } from 'kysely';

type RoundOpts = {
	settings?: boolean | string[];
	fields?: string[];
	unpublished?: boolean;
	publicPrimaryResults?: boolean;
};

type RoundScope = {
	tournId?: number;
};

type RoundWithSettings = Selectable<Round> & {
	settings: Record<string, unknown>;
	eventId?: number | null;
	roundId?: number;
};

type RoundResult<TOpts extends RoundOpts> =
	TOpts['settings'] extends true | string[]
		? RoundWithSettings
		: Selectable<Round> & {
			eventId?: number | null;
			roundId?: number;
		};

function wantsSettings(opts: RoundOpts): opts is RoundOpts & { settings: true | string[] } {
	return opts.settings === true || Array.isArray(opts.settings);
}

function normalizeRoundRow<TOpts extends RoundOpts>(row: Record<string, unknown>, opts: TOpts): RoundResult<TOpts> {
	const next: Record<string, unknown> = { ...row };

	if (wantsSettings(opts)) {
		next.settings = flattenSettingsFromJson(next.settings);
	}

	if (next.event !== undefined && next.eventId === undefined) {
		next.eventId = next.event as number | null;
	}
	if (next.id !== undefined && next.roundId === undefined) {
		next.roundId = next.id as number;
	}

	return next as RoundResult<TOpts>;
}

function buildRoundQuery<TOpts extends RoundOpts>(db: Database, opts: TOpts) {
	let query = db.selectFrom('round').selectAll('round');

	if (!opts.unpublished) {
		query = query.where('round.published', '=', 1);
	}

	if (opts.publicPrimaryResults) {
		query = query
			.where('round.post_primary', '>=', 3)
			.where('round.published', '>', 0);
	}

	if (wantsSettings(opts)) {
		query = query.select(
			settingsRowsJsonSelect({
				table: 'round_setting',
				ownerKey: 'round',
				ownerRef: 'round.id',
				settings: opts.settings,
			}).as('settings')
		);
	}

	return query;
}

export async function getRound<TOpts extends RoundOpts = RoundOpts>(
	db: Database,
	roundId: number,
	opts: TOpts = {} as TOpts,
): Promise<RoundResult<TOpts> | null> {
	const baseRow = await buildRoundQuery(db, opts)
		.where('round.id', '=', roundId)
		.executeTakeFirst();

	if (!baseRow) {
		return null;
	}

	return normalizeRoundRow<TOpts>(baseRow as Record<string, unknown>, opts);
}

export async function getRounds<TOpts extends RoundOpts = RoundOpts>(
	db: Database,
	scope: RoundScope = {},
	opts: TOpts = {} as TOpts,
): Promise<Array<RoundResult<TOpts>>> {
	let query = buildRoundQuery(db, opts);

	if (scope.tournId) {
		query = query
			.innerJoin('event', 'event.id', 'round.event')
			.where('event.tourn', '=', scope.tournId);
	}

	const rows = await query.execute();
	return rows.map((row: Record<string, unknown>) => normalizeRoundRow<TOpts>(row, opts));
}

export async function createRound(db: Database, data: Insertable<Round> & { settings?: Record<string, unknown> }) {
	const { settings, ...roundData } = data;

	return await db.transaction().execute(async (trx) => {
		if (Object.keys(roundData).length === 0) {
			throw new Error('createRound requires round data');
		}

		const round = await trx
			.insertInto('round')
			.values(roundData)
			.returningAll()
			.executeTakeFirstOrThrow();

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'round_setting',
				settings,
				ownerKey: 'round',
				ownerId: round.id,
			});
		}

		return round;
	});
}

export default {
	getRound,
	getRounds,
	createRound,
};
