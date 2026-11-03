import { saveSettings, selectSettings, withTransaction, type Settings } from './utils/index.js';

import type { Database } from '../data/database.js';
import type { Insertable, Updateable } from 'kysely';
import { sql } from 'kysely';
import type { Panel } from '../data/schema.js';
import { flightStart } from '../helpers/flight.js';

type queryOpts = {
	settings?: boolean | string[];
	round?: number;
}
function buildPanelQuery(db: Database, opts: queryOpts){
	let query  = db.selectFrom('panel')
	.$if(opts.settings !== undefined && opts.settings !== false, (q) => q.select(selectSettings({
		table: 'panel',
		settings: opts.settings ?? false,
	})))

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
 * Returns the judges on a panel with their person and its pronoun, one row per judge. chair is 1 when
 * any of the judge's ballots on the panel is the chair's. */
async function getPanelJudges(db: Database, id: number) {
	return await db.selectFrom('ballot')
		.innerJoin('judge', 'judge.id', 'ballot.judge')
		.leftJoin('person', 'person.id', 'judge.person')
		.select(eb => [
			'judge.id',
			'judge.code',
			'judge.first',
			'judge.middle',
			'judge.last',
			'judge.person',
			'person.pronoun',
			eb.fn.max('ballot.chair').as('chair'),
		])
		.where('ballot.panel', '=', id)
		.groupBy(['judge.id', 'judge.person', 'person.pronoun'])
		.execute();
}

/**
 * Returns the students on a panel's entries, one row per entry student, with the entry and its school's chapter.
 * An entry with no students has one row with null student fields */
async function getPanelEntryStudents(db: Database, id: number) {
	return await db.selectFrom('ballot')
		.innerJoin('entry', 'entry.id', 'ballot.entry')
		.leftJoin('entry_student', 'entry_student.entry', 'entry.id')
		.leftJoin('student', 'student.id', 'entry_student.student')
		.leftJoin('school', 'school.id', 'entry.school')
		.select([
			'entry.id as entryId',
			'entry.code as entryCode',
			'entry.name as entryName',
			'school.chapter',
			'student.id as studentId',
			'student.first',
			'student.last',
			'student.person',
		])
		.where('ballot.panel', '=', id)
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
 * Everything needed to work out a section's online room (classic's funclib/online_room.mas).
 * match* is the section with the same round name and letter in the event online_event_match points to,
 * for events that share rooms. live is whether any ballot is unconfirmed or was confirmed in the last hour;
 * rooms close an hour after the round is done
 */
async function getSectionRoomContext(db: Database, id: number) {
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
		.where('panel.id', '=', id)
		.executeTakeFirst();
}

async function deletePanel(db: Database, id: number){
	return await db.deleteFrom('panel')
		.where('id', '=', id)
		.executeTakeFirst();
}

async function getCurrentBallots(db: Database, personId: number, tournId: number){
	const rows = await db
		.selectFrom('judge')
		.innerJoin('category', 'category.id', 'judge.category')
		.innerJoin('tourn', 'tourn.id', 'category.tourn')
		.innerJoin('ballot', 'ballot.judge', 'judge.id')
		.innerJoin('entry', 'entry.id', 'ballot.entry')
		.innerJoin('panel', 'panel.id', 'ballot.panel')
		.innerJoin('round', 'round.id', 'panel.round')
		.innerJoin('event', 'event.id', 'round.event')
		.innerJoin('timeslot', 'timeslot.id', 'round.timeslot')
		.innerJoin('person', 'person.id', 'judge.person')
		.leftJoin('school', 'school.id', 'judge.school')
		.leftJoin('permission', (join) => join
			.onRef('permission.person', '=', 'judge.person')
			.on('permission.tag', '=', 'chapter')
			.onRef('permission.chapter', '=', 'school.chapter')
		)
		.leftJoin('category_setting as rounds_per', (join) => join
			.onRef('rounds_per.category', '=', 'category.id')
			.on('rounds_per.tag', '=', 'rounds_per')
		)
		.leftJoin('room', 'room.id', 'panel.room')
		.leftJoin('score', (join) => join
			.onRef('score.ballot', '=', 'ballot.id')
			.on('score.tag', 'in', ['winloss', 'rank', 'point', 'refute'])
		)
		.leftJoin('event_setting as flight_offset', (join) => join
			.onRef('flight_offset.event', '=', 'event.id')
			.on('flight_offset.tag', '=', 'flight_offset')
		)
		.leftJoin('event_setting as sidelock_elims', (join) => join
			.onRef('sidelock_elims.event', '=', 'event.id')
			.on('sidelock_elims.tag', '=', 'sidelock_elims')
		)
		.leftJoin('event_setting as no_side_constraints', (join) => join
			.onRef('no_side_constraints.event', '=', 'event.id')
			.on('no_side_constraints.tag', '=', 'no_side_constraints')
		)
		.leftJoin('round_setting as use_normal_rooms', (join) => join
			.onRef('use_normal_rooms.round', '=', 'round.id')
			.on('use_normal_rooms.tag', '=', 'use_normal_rooms')
		)
		.leftJoin('event_setting as online_mode', (join) => join
			.onRef('online_mode.event', '=', 'event.id')
			.on('online_mode.tag', '=', 'online_mode')
		)
		.leftJoin('event_setting as online_ballots', (join) => join
			.onRef('online_ballots.event', '=', 'event.id')
			.on('online_ballots.tag', '=', 'online_ballots')
		)
		.leftJoin('event_setting as aff_label', (join) => join
			.onRef('aff_label.event', '=', 'event.id')
			.on('aff_label.tag', '=', 'aff_label')
		)
		.leftJoin('event_setting as neg_label', (join) => join
			.onRef('neg_label.event', '=', 'event.id')
			.on('neg_label.tag', '=', 'neg_label')
		)
		.leftJoin('tourn_setting as legion', (join) => join
			.onRef('legion.tourn', '=', 'tourn.id')
			.on('legion.tag', '=', 'legion')
		)
		.leftJoin('tourn_setting as service_project', (join) => join
			.onRef('service_project.tourn', '=', 'tourn.id')
			.on('service_project.tag', '=', 'service_project')
		)
		.leftJoin('tourn_setting as mock_trial', (join) => join
			.onRef('mock_trial.tourn', '=', 'tourn.id')
			.on('mock_trial.tag', '=', 'mock_trial_registration')
		)
		.leftJoin('round_setting as judges_ballots_visible', (join) => join
			.onRef('judges_ballots_visible.round', '=', 'round.id')
			.on('judges_ballots_visible.tag', '=', 'judges_ballots_visible')
		)
		.leftJoin('round_setting as include_room_notes', (join) => join
			.onRef('include_room_notes.round', '=', 'round.id')
			.on('include_room_notes.tag', '=', 'include_room_notes')
		)
		.leftJoin('panel_setting as flip_status', (join) => join
			.onRef('flip_status.panel', '=', 'panel.id')
			.on('flip_status.tag', '=', 'flip_status')
		)
		.leftJoin('panel_setting as async_setting', (join) => join
			.onRef('async_setting.panel', '=', 'panel.id')
			.on('async_setting.tag', '=', 'show_async')
		)
		.select([
			'judge.id as judgeId',
			'judge.code as judgeCode',
			'judge.first as judgeFirst',
			'judge.last as judgeLast',
			'judge.obligation as judgeObligation',
			'judge.hired as judgeHired',
			'category.id as categoryId',
			'category.name as categoryName',
			'category.abbr as categoryAbbr',
			'event.id as eventId',
			'event.name as eventName',
			'event.abbr as eventAbbr',
			'event.type as eventType',
			'round.id as roundId',
			'round.name as roundName',
			'round.label as roundLabel',
			'round.published as roundPublished',
			'round.flighted as roundFlighted',
			'round.type as roundType',
			'round.start_time as roundStart',
			'timeslot.start as timeslotStart',
			'timeslot.end as timeslotEnd',
			'panel.id as panelId',
			'panel.letter as panelLetter',
			'panel.flight as panelFlight',
			'ballot.id as ballotId',
			'ballot.side as ballotSide',
			'ballot.speakerorder as ballotSpeakerOrder',
			'ballot.audit as ballotAudit',
			'ballot.judge_started as ballotJudgeStarted',
			'ballot.chair as ballotChair',
			'entry.id as entryId',
			'entry.code as entryCode',
			'room.id as roomId',
			'room.notes as roomNotes',
			'online_mode.value as onlineMode',
			'use_normal_rooms.value as useNormalRooms',
			'online_ballots.value as onlineBallots',
			'judges_ballots_visible.value as judgesBallotsVisible',
			'aff_label.value as affLabel',
			'neg_label.value as negLabel',
			'legion.value as legion',
			'service_project.value_text as serviceProject',
			'mock_trial.value as mockTrial',
			'include_room_notes.value as includeRoomNotes',
			'flight_offset.value as flightOffset',
			'sidelock_elims.value as sidelockElims',
			'no_side_constraints.value as noSideConstraints',
			'async_setting.value as asyncValue',
			'person.tz as personTz',
			'tourn.id as tournId',
			'tourn.name as tournName',
			'tourn.tz as tournTz',
			'tourn.hidden as tournHidden',
			'tourn.end as tournEnd',
			'score.id as scoreId',
			'permission.chapter as permissionChapter',
			'school.id as schoolId',
			'school.name as schoolName',
			'rounds_per.value as roundsPer',
			'flip_status.value as flipStatus',
		])
		.select((eb) => [
			eb
				.selectFrom('event_setting as es')
				.select('es.value')
				.whereRef('es.event', '=', 'event.id')
				.where('es.tag', '=', 'start_button')
				.limit(1)
				.as('startButton'),
			eb
				.selectFrom('event_setting as es')
				.select('es.value')
				.whereRef('es.event', '=', 'event.id')
				.where('es.tag', '=', 'start_button_text')
				.limit(1)
				.as('startButtonText'),
		])
		.where('judge.person', '=', personId)
		.where('tourn.id', '=', tournId)
		.where('tourn.end', '>=', new Date(Date.now()))
		.where('entry.active', '=', 1)
		.groupBy(['panel.id', 'judge.id', 'ballot.entry'])
		.orderBy('timeslot.start')
		.orderBy('event.abbr')
		.orderBy('round.name')
		.orderBy('panel.flight')
		.orderBy('ballot.audit')
		.execute();

	const panels = new Map();
	rows.forEach((row: typeof rows[number]) => {
		let panel = panels.get(row.panelId);
		if (!panel) {
			panel = {
				id: row.panelId,
				letter: row.panelLetter,
				flight: row.panelFlight,
				scored: row.scoreId != null,
				settings: {
					flip_status: row.flipStatus,
					show_async: row.asyncValue,
				},
				Judge: {
					id: row.judgeId,
					code: row.judgeCode,
					first: row.judgeFirst,
					last: row.judgeLast,
					obligation: row.judgeObligation,
					hired: row.judgeHired,
					Category: {
						id: row.categoryId,
						name: row.categoryName,
						abbr: row.categoryAbbr,
						Tourn: {
							id: row.tournId,
							name: row.tournName,
							tz: row.tournTz,
							hidden: row.tournHidden,
							end: row.tournEnd,
							settings: {
								legion: row.legion,
							},
						},
						Event: {
							id: row.eventId,
							name: row.eventName,
							abbr: row.eventAbbr,
							type: row.eventType,
							settings: {
								online_mode: row.onlineMode,
								online_ballots: row.onlineBallots === '1',
								start_button: row.startButton,
								start_button_text: row.startButtonText,
								flight_offset: row.flightOffset,
								aff_label: row.affLabel,
								neg_label: row.negLabel,
							},
						},
					},
				},
				Round: {
					id: row.roundId,
					name: row.roundName,
					label: row.roundLabel,
					published: row.roundPublished === 1,
					flighted: row.roundFlighted,
					type: row.roundType,
					start: row.roundStart,
					settings: {
						judges_ballots_visible: row.judgesBallotsVisible === '1',
					},
					Timeslot: {
						start: row.timeslotStart,
						end: row.timeslotEnd,
					},
				},
				Room: {
					id: row.roomId,
					notes: row.roomNotes,
				},
				Ballots: [],
				Entries: [],
			};
			panels.set(row.panelId, panel);
		};
		panel.Ballots.push({
			id: row.ballotId,
			side: row.ballotSide,
			speakerOrder: row.ballotSpeakerOrder,
			audit: row.ballotAudit,
			judge_started: row.ballotJudgeStarted,
			chair: row.ballotChair,
			entry: row.entryId,
		});
		panel.Entries.push({
			id: row.entryId,
			code: row.entryCode,
		});
	});
	return [...panels.values()];
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
	getCurrentBallots,
	getJudgeHistoryPanels,
};
