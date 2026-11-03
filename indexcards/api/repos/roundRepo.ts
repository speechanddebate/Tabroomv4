import { saveSettings, selectSettings, withTransaction, type Settings } from './utils/index.js';

import type { Database } from '../data/database.js';
import type { Round } from '../data/schema.js';
import type { Insertable } from 'kysely';

type queryOpts = {
	ids?: number[];
	settings?: boolean | string[];
	fields?: string[];
	unpublished?: boolean;
	publicPrimaryResults?: boolean;
	/** only rounds whose strike cards are open (round_setting strikes_published) */
	strikesPublished?: boolean;
};

type RoundScope = {
	tournId?: number;
};

function buildRoundQuery(db: Database, opts: queryOpts) {
	let query = db.selectFrom('round')
	.$if(opts.settings !== undefined && opts.settings !== false, (q) => q.select(selectSettings({
		table: 'round',
		settings: opts.settings ?? false,
	})))

	if (opts.ids) {
		query = query.where('round.id', 'in', opts.ids);
	}

	if (!opts.unpublished) {
		query = query.where('round.published', '=', 1);
	}

	if (opts.publicPrimaryResults) {
		query = query
			.where('round.post_primary', '>=', 3)
			.where('round.published', '>', 0);
	}

	if (opts.strikesPublished) {
		query = query.where(({ exists, selectFrom }) => exists(
			selectFrom('round_setting')
				.select('round_setting.id')
				.whereRef('round_setting.round', '=', 'round.id')
				.where('round_setting.tag', '=', 'strikes_published')
				.where('round_setting.value', '=', '1')
		));
	}

	return query;
}

export async function getRound(
	db: Database,
	roundId: number,
	opts: queryOpts = {},
) {
	return await buildRoundQuery(db, opts)
		.where('round.id', '=', roundId)
		.selectAll('round')
		.executeTakeFirst();
}

export async function getRounds(
	db: Database,
	scope: RoundScope = {},
	opts: queryOpts = {},
) {
	let query = buildRoundQuery(db, opts);

	if (scope.tournId) {
		query = query
			.innerJoin('event', 'event.id', 'round.event')
			.where('event.tourn', '=', scope.tournId);
	}

	return await query.selectAll('round').execute();
}

export async function createRound(db: Database, data: Insertable<Round> & { settings?: Settings }) {
	const { settings, ...roundData } = data;

	return await withTransaction(db, async (trx) => {
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
				table: 'round',
				settings,
				ownerId: round.id,
			});
		}

		return round;
	});
}

/**
 * The rounds with an open strike card for these schools: the pairing is not fully
 * published yet and one of the school's entries is on a panel that is not a bye. One row
 * per round and school, with the round's strikes_due setting
 */
export async function getSchoolStrikeCards(db: Database, opts: queryOpts & { schools: number[] }) {
	return await buildRoundQuery(db, { settings: ['strikes_due'], ...opts, strikesPublished: true, unpublished: true })
		.innerJoin('panel', 'panel.round', 'round.id')
		.innerJoin('ballot', 'ballot.panel', 'panel.id')
		.innerJoin('entry', 'entry.id', 'ballot.entry')
		.select([
			'round.id',
			'round.name',
			'round.label',
			'entry.school',
		])
		.where('round.published', '!=', 1)
		.where('panel.bye', '=', 0)
		.where('entry.school', 'in', opts.schools)
		.groupBy(['round.id', 'entry.school'])
		.execute();
}

export default {
	getRound,
	getRounds,
	getSchoolStrikeCards,
	createRound,
};
