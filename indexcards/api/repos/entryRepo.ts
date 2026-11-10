import { saveSettings, selectSettings, type Settings } from './utils/index.js';
import type { Insertable } from 'kysely';
import type { Entry } from '../data/schema.js';

import type { Database } from '../data/database.js';

type entryOpts = {
	limit?: number,
	offset?: number,
	settings?: boolean | string[],
	ids?: number[],
	tourns?: number[],
	/** entries in the events of these categories */
	categories?: number[],
	schools?: number[],
	active?: boolean,
	/** entries one of the person's unretired students is on */
	person?: number,
	/** entries carrying a student linked to any of these people */
	studentPersons?: number[],
}
function buildEntryQuery(db: Database, opts: entryOpts = {}) {
	let query = db.selectFrom('entry')
	.$if(opts.settings !== undefined && opts.settings !== false, (qb) => qb.select(selectSettings({
			table: 'entry',
			settings: opts.settings ?? false,
		}
	)))

	query = opts.ids
		? query.where('entry.id', 'in', opts.ids)
		: query;

	// through the event: entry.tourn is null or wrong on a share of rows. The empty list goes
	// in directly: the empty IN plugin rewrites it there, not inside a subquery
	query = opts.tourns
		? query.where('entry.event', 'in', opts.tourns.length ? (eb) => eb
			.selectFrom('event')
			.select('event.id')
			.where('event.tourn', 'in', opts.tourns!)
		: [])
		: query;

	query = opts.categories
		? query.where('entry.event', 'in', opts.categories.length ? (eb) => eb
			.selectFrom('event')
			.select('event.id')
			.where('event.category', 'in', opts.categories!)
		: [])
		: query;

	query = opts.schools
		? query.where('entry.school', 'in', opts.schools)
		: query;

	query = opts.active
		? query.where('entry.active', '=', 1)
		: query;

	query = opts.person
		? query.where('entry.id', 'in', (eb) => eb
			.selectFrom('entry_student')
			.innerJoin('student', 'student.id', 'entry_student.student')
			.select('entry_student.entry')
			.where('student.person', '=', opts.person!)
			.where('student.retired', '=', 0)
		)
		: query;

	query = opts.studentPersons
		? query.where('entry.id', 'in', opts.studentPersons.length ? (eb) => eb
			.selectFrom('entry_student')
			.innerJoin('student', 'student.id', 'entry_student.student')
			.select('entry_student.entry')
			.where('student.person', 'in', opts.studentPersons!)
		: [])
		: query;

	query = opts.limit
		? query.limit(opts.limit)
		: query;

	query = opts.offset
		? query.offset(opts.offset)
		: query;

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

	return row;
}

async function getEntries(db: Database, opts: entryOpts = {}) {
	return await buildEntryQuery(db, opts)
		.selectAll('entry')
		.execute();
}

/**
 * Returns the students on these entries, with each student's pronoun from their person
 * (null when the student has no person). */
async function getEntryStudents(db: Database, entryIds: number[]) {
	return await db.selectFrom('entry_student')
		.innerJoin('student', 'student.id', 'entry_student.student')
		.leftJoin('person', 'person.id', 'student.person')
		.select([
			'entry_student.entry',
			'student.id',
			'student.first',
			'student.middle',
			'student.last',
			'person.pronoun',
		])
		.where('entry_student.entry', 'in', entryIds)
		.execute();
}

/** Entries with their school and event, in sheet order: school, event, entry name */
async function getCategoryEntries(db: Database, opts: entryOpts & { categories: number[] }) {
	return await buildEntryQuery(db, opts)
		.innerJoin('event', 'event.id', 'entry.event')
		.leftJoin('school', 'school.id', 'entry.school')
		.select([
			'entry.id',
			'entry.code',
			'entry.name',
			'entry.school',
			'event.id as eventId',
			'school.name as schoolName',
			'event.name as eventName',
			'event.abbr as eventAbbr',
			'event.category as eventCategory',
		])
		.orderBy('school.name')
		.orderBy('event.name')
		.orderBy('entry.name')
		.execute();
}

async function createEntry(db: Database, data: Insertable<Entry> & { settings?: Settings }) {
	const { settings, ...entryData } = data;
	const res =  await db.insertInto('entry')
		.values(entryData)
		.returningAll()
		.executeTakeFirstOrThrow();

	if (settings) {
		await saveSettings({db, table: 'entry', ownerId: res.id, settings});
		return {
			...res,
			settings,
		};
	}

	return res;
}

/**
 * The entries the person's students are in, with the event and the student row that puts
 * the person on each. Pass tourns to limit them to those tournaments. The optimizer starts
 * from the person's students on its own here (checked with EXPLAIN on a 700-student
 * person), unlike the one-tourn query in getPersonTournSummary that needs a straight_join
 */
async function getPersonEntries(db: Database, personId: number, opts: entryOpts = {}) {
	return await buildEntryQuery(db, { ...opts, person: personId })
		// the person's own student row on the entry, not a partner's
		.innerJoin('entry_student', 'entry_student.entry', 'entry.id')
		.innerJoin('student', (join) => join
			.onRef('student.id', '=', 'entry_student.student')
			.on('student.person', '=', personId)
			.on('student.retired', '=', 0)
		)
		.innerJoin('event', 'event.id', 'entry.event')
		.select([
			'entry.id',
			'entry.code',
			'entry.name',
			'entry.active',
			'entry.dropped',
			'entry.waitlist',
			'entry.unconfirmed',
			'entry.school',
			'event.id as event',
			'event.name as eventName',
			'event.abbr as eventAbbr',
			'event.type as eventType',
			'event.category',
			'event.tourn as tourn',
			'student.id as student',
		])
		.execute();
}

/** How many entries are at each tourn, keyed by tourn id. Counted through the event, like the tourns filter */
async function countByTourn(db: Database, opts: entryOpts = {}) {
	const rows = await buildEntryQuery(db, opts)
		.innerJoin('event', 'event.id', 'entry.event')
		.select(({ fn }) => ['event.tourn', fn.countAll<number>().as('count')])
		.groupBy('event.tourn')
		.execute();
	return new Map(rows.map(row => [row.tourn, Number(row.count)]));
}

export default {
	getEntry,
	getEntries,
	getEntryStudents,
	getCategoryEntries,
	getPersonEntries,
	countByTourn,
	createEntry,
};
