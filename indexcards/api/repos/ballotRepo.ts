import type { Database } from '../data/database.js';
import { sql, type Insertable, type Updateable } from 'kysely';
import type { Ballot } from '../data/schema.js';
import { SCORE_TAGS } from '../services/ballots/ballotRules.js';

type queryOpts = {
	winnerBallot?: boolean;
	panel?: number;
	panels?: number[];
	judge?: number;
	judges?: number[];
	entries?: number[];
	/** only ballots whose round is published at any level or has primary results posted */
	roundVisible?: boolean;
	/** only audited (entered and confirmed) ballots */
	audited?: boolean;
	// Locks the rows until the transaction ends. Only use inside a transaction
	forUpdate?: boolean;
};
function buildBallotQuery(db: Database, opts: queryOpts = {}){
	let query  = db.selectFrom('ballot');

	query = opts.panel ? query.where('ballot.panel', '=', opts.panel) : query;
	query = opts.panels ? query.where('ballot.panel', 'in', opts.panels) : query;
	query = opts.judge ? query.where('ballot.judge', '=', opts.judge) : query;
	query = opts.judges ? query.where('ballot.judge', 'in', opts.judges) : query;
	query = opts.entries ? query.where('ballot.entry', 'in', opts.entries) : query;
	query = opts.audited ? query.where('ballot.audit', '=', 1) : query;
	query = opts.roundVisible
		? query.where('ballot.panel', 'in', (eb) => eb
			.selectFrom('panel')
			.innerJoin('round', 'round.id', 'panel.round')
			.select('panel.id')
			.where((rb) => rb.or([rb('round.published', '>', 0), rb('round.post_primary', '>', 0)]))
		)
		: query;
	query = opts.forUpdate ? query.forUpdate() : query;
	if (opts.winnerBallot) {
		query = query.innerJoin('score', 'ballot.id', 'score.ballot')
		.where('score.tag', '=', 'winloss')
		.where('score.value', '=', 1);
	}
	return query;
}

export async function getBallot(db: Database, id: number, opts: queryOpts = {}) {
	return await buildBallotQuery(db, opts)
	.selectAll('ballot')
	.where('ballot.id', '=', id)
	.executeTakeFirst();
}

export async function getBallots(db: Database, opts: queryOpts = {}) {
	return await buildBallotQuery(db, opts)
	.selectAll('ballot')
	.execute();
}
export async function createBallot(db: Database, data: Insertable<Ballot> = {}){
	return await db.insertInto('ballot')
	.values(data)
	.returningAll()
	.executeTakeFirstOrThrow();
}

export async function updateBallots(db: Database, ids: number[], data: Updateable<Ballot>) {
	if (ids.length === 0) return ids;
	await db.updateTable('ballot')
	.set(data)
	.where('id', 'in', ids)
	.execute();
	return ids;
}

// Sets who started the judge's ballot rows on the panel and when, on rows not started yet.
// Returns whether any row changed
export async function markBallotsStarted(db: Database, opts: { judge: number, panel: number, person: number }) {
	const result = await db.updateTable('ballot')
	.set({ started_by: opts.person, judge_started: sql<Date>`NOW()` })
	.where('judge', '=', opts.judge)
	.where('panel', '=', opts.panel)
	.where('judge_started', 'is', null)
	.executeTakeFirst();
	return result.numUpdatedRows > 0;
}

export async function deleteBallots(db: Database, ids: number[]) {
	if (ids.length === 0) return false;
	const result = await db.deleteFrom('ballot')
	.where('id', 'in', ids)
	.executeTakeFirst();
	return result.numDeletedRows > 0;
}

/** Per judge, the distinct panels and the ballots they have had audited, keyed by judge id */
export async function getJudgeBallotCounts(db: Database, opts: queryOpts & { judges: number[] }) {
	const rows = await buildBallotQuery(db, { ...opts, audited: true })
		.select(({ fn }) => [
			'ballot.judge',
			fn.count<number>('ballot.panel').distinct().as('panels'),
			fn.countAll<number>().as('ballots'),
		])
		.groupBy('ballot.judge')
		.execute();
	return new Map(rows.map(row => [row.judge, { panels: Number(row.panels), ballots: Number(row.ballots) }]));
}

/** The ballot query joined to its panel, round, event, entry, timeslot, and room, in schedule order */
function joinPanelContext(query: ReturnType<typeof buildBallotQuery>) {
	return query
		.innerJoin('panel', 'panel.id', 'ballot.panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.innerJoin('event', 'event.id', 'round.event')
		.innerJoin('entry', 'entry.id', 'ballot.entry')
		.leftJoin('timeslot', 'timeslot.id', 'round.timeslot')
		.leftJoin('room', 'room.id', 'panel.room')
		.orderBy('timeslot.start')
		.orderBy('round.name')
		.orderBy('panel.flight')
		.orderBy('ballot.side')
		.orderBy('ballot.speakerorder');
}

/** The judges' ballots with what their panel card shows: the round, its time, the room, and each entry */
export async function getJudgePanels(db: Database, opts: queryOpts & { judges: number[] }) {
	return await joinPanelContext(buildBallotQuery(db, opts))
		// Events that share rooms meet in the matched event's section; the Campus room is named after it
		.leftJoin('event_setting as online_event_match', (join) => join
			.onRef('online_event_match.event', '=', 'event.id')
			.on('online_event_match.tag', '=', 'online_event_match'))
		.leftJoin('event as match_event', 'match_event.id', 'online_event_match.value')
		.select([
			'ballot.id',
			'ballot.judge',
			'ballot.side',
			'ballot.speakerorder',
			'ballot.audit',
			'ballot.judge_started',
			'ballot.chair',
			'panel.id as panel',
			'panel.letter as panelLetter',
			'panel.flight as panelFlight',
			'round.id as round',
			'round.name as roundName',
			'round.label as roundLabel',
			'round.type as roundType',
			'round.published as roundPublished',
			'round.flighted as roundFlighted',
			'round.start_time as roundStart',
			'timeslot.start as timeslotStart',
			'timeslot.end as timeslotEnd',
			'room.id as room',
			'room.name as roomName',
			'room.url as roomUrl',
			'room.judge_url as roomJudgeUrl',
			'room.notes as roomNotes',
			'event.id as event',
			'event.name as eventName',
			'event.abbr as eventAbbr',
			'match_event.abbr as matchEventAbbr',
			'event.type as eventType',
			'event.category',
			'event.tourn',
			'entry.id as entry',
			'entry.code as entryCode',
			'entry.active as entryActive',
		])
		.select((eb) => eb.selectFrom('score')
			.select('score.tag')
			.whereRef('score.ballot', '=', 'ballot.id')
			.where('score.tag', 'in', SCORE_TAGS)
			.limit(1)
			.as('scoreTag'))
		.execute();
}

/**
 * The ballots on the entries' or panels' rounds with what the round table shows: the round
 * and its publish levels, the panel, the room, the entry, and the judge on each ballot
 */
export async function getEntryRounds(db: Database, opts: queryOpts = {}) {
	return await joinPanelContext(buildBallotQuery(db, opts))
		.leftJoin('judge', 'judge.id', 'ballot.judge')
		.select([
			'ballot.id',
			'ballot.side',
			'ballot.speakerorder',
			'ballot.audit',
			'panel.id as panel',
			'panel.letter as panelLetter',
			'panel.flight as panelFlight',
			'panel.bye as panelBye',
			'round.id as round',
			'round.name as roundName',
			'round.label as roundLabel',
			'round.type as roundType',
			'round.published as roundPublished',
			'round.post_primary as roundPostPrimary',
			'round.post_secondary as roundPostSecondary',
			'round.post_feedback as roundPostFeedback',
			'round.flighted as roundFlighted',
			'round.start_time as roundStart',
			'timeslot.start as timeslotStart',
			'room.name as roomName',
			'room.url as roomUrl',
			'event.id as event',
			'event.type as eventType',
			'event.category',
			'event.tourn',
			'entry.id as entry',
			'entry.code as entryCode',
			'entry.school as entrySchool',
			'judge.id as judge',
			'judge.first as judgeFirst',
			'judge.last as judgeLast',
			'judge.code as judgeCode',
		])
		.execute();
}

export default {
	getBallot,
	getBallots,
	getJudgeBallotCounts,
	getJudgePanels,
	getEntryRounds,
	createBallot,
	updateBallots,
	markBallotsStarted,
	deleteBallots,
};