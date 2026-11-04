import { saveSettings, selectSettings, withTransaction, type Settings } from './utils/index.js';

import type { Database } from '../data/database.js';
import type { Insertable, Updateable } from 'kysely';
import { sql } from 'kysely';
import type { Panel } from '../data/schema.js';
import { flightStart } from '../helpers/flight.js';

type queryOpts = {
	settings?: boolean | string[];
	ids?: number[];
	round?: number;
}
function buildPanelQuery(db: Database, opts: queryOpts){
	let query  = db.selectFrom('panel')
	.$if(opts.settings !== undefined && opts.settings !== false, (q) => q.select(selectSettings({
		table: 'panel',
		settings: opts.settings ?? false,
	})))

	query = opts.ids ? query.where('panel.id', 'in', opts.ids) : query;
	query = opts.round ? query.where('panel.round', '=', opts.round) : query;

	return query;
}

async function getPanel(db: Database, id: number, opts: queryOpts = {}){
	return await buildPanelQuery(db, opts)
	.where('panel.id', '=', id)
	.selectAll('panel')
	.executeTakeFirst();
}

/**
 * Returns every panel where this panel's two entries met, this one included, with each
 * entry's side and the round number, bye and forfeit flags, one row per ballot.
 * Empty unless the panel has exactly two entries. */
async function getMeetings(db: Database, id: number) {
	const current = await db.selectFrom('ballot')
		.select('ballot.entry')
		.where('ballot.panel', '=', id)
		.distinct()
		.execute();

	const entries = current.map(row => row.entry).filter(entry => entry !== null);
	if (entries.length !== 2) return [];

	const rows = await db.selectFrom('ballot')
		.innerJoin('panel', 'panel.id', 'ballot.panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.select([
			'panel.id as panel',
			'round.name as round',
			'panel.bye as panelBye',
			'ballot.entry',
			'ballot.side',
			'ballot.bye',
			'ballot.forfeit',
		])
		.where('ballot.entry', 'in', entries)
		.execute();

	// Only panels where both entries were there
	const entriesByPanel = new Map<number, Set<number | null>>();
	for (const row of rows) {
		entriesByPanel.set(row.panel, (entriesByPanel.get(row.panel) ?? new Set()).add(row.entry));
	}

	return rows.filter(row => entriesByPanel.get(row.panel)?.size === 2);
}

/**
 * Returns pairs of this panel's entries and the other entries they're doubled with: entries
 * sharing a student that have a ballot in a round whose timeslot overlaps this one, at any
 * tourn (round_doubled.mas). One row per pair. */
async function getDoubledEntries(db: Database, id: number) {
	const timeslot = await db.selectFrom('panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.innerJoin('timeslot', 'timeslot.id', 'round.timeslot')
		.select(['timeslot.start', 'timeslot.end'])
		.where('panel.id', '=', id)
		.executeTakeFirst();
	if (!timeslot?.start || !timeslot.end) return [];

	return await db.selectFrom('ballot')
		.innerJoin('panel', 'panel.id', 'ballot.panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.innerJoin('timeslot', 'timeslot.id', 'round.timeslot')
		.innerJoin('entry_student as es', 'es.entry', 'ballot.entry')
		.innerJoin('entry_student as oes', join => join
			.onRef('oes.student', '=', 'es.student')
			.onRef('oes.entry', '!=', 'es.entry'))
		.innerJoin('ballot as oballot', 'oballot.entry', 'oes.entry')
		.innerJoin('panel as opanel', 'opanel.id', 'oballot.panel')
		.innerJoin('round as oround', 'oround.id', 'opanel.round')
		.innerJoin('timeslot as otimeslot', 'otimeslot.id', 'oround.timeslot')
		.select(['ballot.entry as entry', 'oes.entry as other'])
		.where('ballot.panel', '=', id)
		.where('es.student', '>', 0)
		// Every overlap below falls inside this panel's timeslot. As constants these bounds can
		// use the timeslot indexes, so students with long histories don't join every ballot they've had
		.where('otimeslot.start', '<=', timeslot.end)
		.where('otimeslot.end', '>=', timeslot.start)
		.where(eb => eb.or([
			eb('otimeslot.id', '=', eb.ref('timeslot.id')),
			eb.and([
				eb('otimeslot.start', '<', eb.ref('timeslot.end')),
				eb('otimeslot.end', '>', eb.ref('timeslot.start')),
			]),
			eb.and([
				eb('otimeslot.start', '=', eb.ref('timeslot.end')),
				eb('otimeslot.end', '=', eb.ref('timeslot.start')),
			]),
		]))
		.distinct()
		.execute();
}

/**
 * Returns the judges on the panels with their person and its pronoun, one row per judge per panel. chair is 1
 * when any of the judge's ballots on that panel is the chair's. */
async function getPanelJudges(db: Database, panelIds: number[]) {
	return await db.selectFrom('ballot')
		.innerJoin('judge', 'judge.id', 'ballot.judge')
		.leftJoin('person', 'person.id', 'judge.person')
		.select(eb => [
			'ballot.panel',
			'judge.id',
			'judge.code',
			'judge.first',
			'judge.middle',
			'judge.last',
			'judge.person',
			'person.pronoun',
			eb.fn.max('ballot.chair').as('chair'),
		])
		.where('ballot.panel', 'in', panelIds)
		.groupBy(['ballot.panel', 'judge.id', 'judge.person', 'person.pronoun'])
		.execute();
}

/**
 * Returns the students on the panels' entries, one row per entry student per panel, with the entry and its school's
 * chapter. An entry with no students has one row with null student fields */
async function getPanelEntryStudents(db: Database, panelIds: number[]) {
	return await db.selectFrom('ballot')
		.innerJoin('entry', 'entry.id', 'ballot.entry')
		.leftJoin('entry_student', 'entry_student.entry', 'entry.id')
		.leftJoin('student', 'student.id', 'entry_student.student')
		.leftJoin('school', 'school.id', 'entry.school')
		.select([
			'ballot.panel',
			'entry.id as entryId',
			'entry.code as entryCode',
			'entry.name as entryName',
			'school.chapter',
			'student.id as studentId',
			'student.first',
			'student.last',
			'student.person',
		])
		.where('ballot.panel', 'in', panelIds)
		.distinct()
		.execute();
}

async function getPanels(db: Database, opts: queryOpts = {}) {
	return await buildPanelQuery(db, opts).selectAll('panel').execute();
}
async function createPanel(db: Database, data: Insertable<Panel> & { settings?: Settings }){
	const { settings, ...panelData } = data;

	return await withTransaction(db, async (trx) => {
		if (Object.keys(panelData).length === 0) {
			throw new Error('createPanel requires panel data');
		}

		const panel = await trx
			.insertInto('panel')
			.values(panelData)
			.returningAll()
			.executeTakeFirstOrThrow();

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'panel',
				settings,
				ownerId: panel.id,
			});
		}

		return panel;
	});
}

async function updatePanel(db: Database, id: number, data: Updateable<Panel> & { settings?: Settings }){
	const { settings, ...panelData } = data;

	return await withTransaction(db, async (trx) => {
		if (Object.keys(panelData).length > 0) {
			await trx
				.updateTable('panel')
				.set(panelData)
				.where('id', '=', id)
				.executeTakeFirstOrThrow();
		}

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'panel',
				settings,
				ownerId: id,
			});
		}

		return id;
	});
}

// Returns the tournament the panel's round belongs to
async function getPanelTourn(db: Database, id: number) {
	return await db.selectFrom('panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.innerJoin('event', 'event.id', 'round.event')
		.innerJoin('tourn', 'tourn.id', 'event.tourn')
		.selectAll('tourn')
		.where('panel.id', '=', id)
		.executeTakeFirst();
}

/**
 * Everything needed to work out each section's online room (classic's funclib/online_room.mas).
 * match* is the section with the same round name and letter in the event online_event_match points to,
 * for events that share rooms; a section gets a row per match if that finds more than one. live is whether any ballot is unconfirmed or was confirmed in the last hour;
 * rooms close an hour after the round is done
 */
async function getSectionRoomContext(db: Database, ids: number[]) {
	return await db.selectFrom('panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.innerJoin('event', 'event.id', 'round.event')
		.innerJoin('tourn', 'tourn.id', 'event.tourn')
		.leftJoin('room', 'room.id', 'panel.room')
		.leftJoin('event_setting as online_event_match', (join) => join
			.onRef('online_event_match.event', '=', 'event.id')
			.on('online_event_match.tag', '=', 'online_event_match')
		)
		.leftJoin('event as match_event', 'match_event.id', 'online_event_match.value')
		.leftJoin('round as match_round', (join) => join
			.onRef('match_round.event', '=', 'match_event.id')
			.onRef('match_round.name', '=', 'round.name')
		)
		.leftJoin('panel as match_panel', (join) => join
			.onRef('match_panel.round', '=', 'match_round.id')
			.onRef('match_panel.letter', '=', 'panel.letter')
		)
		.select((eb) => [
			'panel.id as panelId',
			'panel.letter as panelLetter',
			'event.id as eventId',
			'event.abbr as eventAbbr',
			'tourn.id as tournId',
			'tourn.tz as tournTz',
			'room.name as roomName',
			'room.url as roomUrl',
			'room.password as roomPassword',
			'room.judge_url as roomJudgeUrl',
			'room.judge_password as roomJudgePassword',
			'match_panel.id as matchPanelId',
			'match_event.id as matchEventId',
			'match_event.abbr as matchEventAbbr',
			...selectSettings({ table: 'panel', settings: ['online_hybrid'], as: 'panelSettings' }),
			...selectSettings({ table: 'round', settings: ['override_link', 'use_normal_rooms'], as: 'roundSettings' }),
			...selectSettings({
				table: 'event',
				settings: [
					'online_mode',
					'online_hybrid',
					'online_support',
					'online_instructions',
					'online_judge_display',
					'online_entry_display',
					'online_prepend_role',
				],
				as: 'eventSettings',
			}),
			...selectSettings({ table: 'tourn', settings: ['campus_zone'], as: 'tournSettings' }),
			eb.exists(eb.selectFrom('ballot')
				.select('ballot.id')
				.whereRef('ballot.panel', '=', 'panel.id')
				.where((b) => b.or([
					b('ballot.audit', '!=', 1),
					b('ballot.timestamp', '>', sql<Date>`NOW() - INTERVAL 1 HOUR`),
				]))
			).as('live'),
		])
		.where('panel.id', 'in', ids)
		.execute();
}

async function deletePanel(db: Database, id: number){
	return await db.deleteFrom('panel')
		.where('id', '=', id)
		.executeTakeFirst();
}

/**
 * A judge's sections in published rounds for their history page. A section is 'assigned'
 * until the round's primary results are posted, then it is 'results'.
 */
async function getJudgeHistoryPanels(db: Database, judgeId: number) {
	const rows = await db.selectFrom('ballot')
		.innerJoin('panel', 'ballot.panel', 'panel.id')
		.innerJoin('round', 'panel.round', 'round.id')
		.innerJoin('event', 'round.event', 'event.id')
		.innerJoin('entry', 'ballot.entry', 'entry.id')
		.leftJoin('timeslot', 'round.timeslot', 'timeslot.id')
		.leftJoin('room', 'panel.room', 'room.id')
		.leftJoin('event_setting as aff_label', (join) => join
			.onRef('aff_label.event', '=', 'event.id')
			.on('aff_label.tag', '=', 'aff_label')
		)
		.leftJoin('event_setting as neg_label', (join) => join
			.onRef('neg_label.event', '=', 'event.id')
			.on('neg_label.tag', '=', 'neg_label')
		)
		.leftJoin('event_setting as flight_offset', (join) => join
			.onRef('flight_offset.event', '=', 'event.id')
			.on('flight_offset.tag', '=', 'flight_offset')
		)
		.select([
			'panel.id as panel_id',
			'panel.flight as panel_flight',
			'timeslot.start as timeslot_start',

			'round.id as round_id',
			'round.name as round_name',
			'round.label as round_label',
			'round.type as round_type',
			'round.flighted as round_flighted',
			'round.start_time as round_start_time',
			'round.post_primary as round_post_primary',

			'event.id as event_id',
			'event.abbr as event_abbr',
			'event.type as event_type',
			'aff_label.value as aff_label',
			'neg_label.value as neg_label',
			'flight_offset.value as flight_offset',

			'room.id as room_id',
			'room.name as room_name',

			'entry.id as entry_id',
			'entry.code as entry_code',
			'entry.name as entry_name',
			'ballot.side as ballot_side',
			'ballot.speakerorder as ballot_speakerorder',
		])
		.where('ballot.judge', '=', judgeId)
		.where('round.published', '=', 1)
		.orderBy('round.name')
		.orderBy('panel.flight')
		.orderBy('ballot.side')
		.orderBy('ballot.speakerorder')
		.execute();

	type Entry = { id: number; code: string | null; name: string | null; side: number | null; speakerorder: number | null };
	const panels = new Map<number, {
		id: number;
		stage: 'assigned' | 'results';
		// The flight number, only when the round is flighted
		flight: number | null;
		start: Date | null;
		Round: { id: number; name: number | null; label: string | null; type: string | null };
		Event: { id: number; abbr: string | null; type: string | null };
		// The event's side names shown next to each entry
		SideLabels: { aff: string | null; neg: string | null };
		Room: { id: number; name: string } | null;
		Entries: Entry[];
	}>();

	for (const row of rows) {
		let panel = panels.get(row.panel_id);
		if (!panel) {
			const start = row.round_start_time ?? row.timeslot_start;
			const flighted = (row.round_flighted ?? 0) > 1;
			panel = {
				id: row.panel_id,
				stage: (row.round_post_primary ?? 0) >= 3 ? 'results' : 'assigned',
				flight: flighted && row.panel_flight ? Number(row.panel_flight) : null,
				start: start ? flightStart(start, row.panel_flight, row.flight_offset) : null,
				Round: {
					id: row.round_id,
					name: row.round_name,
					label: row.round_label,
					type: row.round_type,
				},
				Event: {
					id: row.event_id,
					abbr: row.event_abbr,
					type: row.event_type,
				},
				SideLabels: { aff: row.aff_label, neg: row.neg_label },
				Room: row.room_id ? { id: row.room_id, name: row.room_name ?? '' } : null,
				Entries: [],
			};
			panels.set(row.panel_id, panel);
		}
		// One ballot per entry for this judge, but guard against duplicates anyway
		if (!panel.Entries.some(e => e.id === row.entry_id)) {
			panel.Entries.push({
				id: row.entry_id,
				code: row.entry_code,
				name: row.entry_name,
				side: row.ballot_side,
				speakerorder: row.ballot_speakerorder,
			});
		}
	}

	return [...panels.values()];
}

export default {
	getPanel,
	getPanels,
	getMeetings,
	getDoubledEntries,
	getPanelJudges,
	updatePanel,
	getPanelTourn,
	getSectionRoomContext,
	getPanelEntryStudents,
	createPanel,
	deletePanel,
	getJudgeHistoryPanels,
};
