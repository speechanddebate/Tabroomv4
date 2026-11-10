import type { Insertable } from 'kysely';
import type { Database } from '../data/database.js';
import type { Strike } from '../data/schema.js';

type queryOpts = {
	ids?: number[];
	judges?: number[];
	tourn?: number;
	types?: string[];
	/**
	 * only the strikes a judge may see, classic's user/judge/index.mhtml rule: strikes with
	 * the conflict flag, where school and entry ones also need a registrant to have entered
	 * them. Tab-entered strikes of any type stay hidden
	 */
	judgeVisible?: boolean;
};

function buildStrikeQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('strike');

	if (opts.ids) query = query.where('strike.id', 'in', opts.ids);
	if (opts.judges) query = query.where('strike.judge', 'in', opts.judges);
	if (opts.tourn) query = query.where('strike.tourn', '=', opts.tourn);
	if (opts.types) query = query.where('strike.type', 'in', opts.types);
	if (opts.judgeVisible) {
		query = query
			.where('strike.conflict', '=', 1)
			.where((eb) => eb.or([
				eb('strike.type', 'not in', ['entry', 'school']),
				eb('strike.registrant', '=', 1),
			]));
	}

	return query;
}

async function getStrikes(db: Database, opts: queryOpts = {}) {
	return await buildStrikeQuery(db, opts)
		.selectAll('strike')
		.execute();
}

/** The strikes these judges may see, with the school, entry code, or region name each is against */
async function getJudgeStrikes(db: Database, opts: queryOpts & { judges: number[] }) {
	return await buildStrikeQuery(db, { ...opts, judgeVisible: true })
		.leftJoin('school', 'school.id', 'strike.school')
		.leftJoin('entry', 'entry.id', 'strike.entry')
		.leftJoin('region', 'region.id', 'strike.region')
		.select([
			'strike.id',
			'strike.type',
			'strike.start',
			'strike.end',
			'strike.judge',
			'strike.school',
			'school.name as schoolName',
			'strike.entry',
			'entry.code as entryCode',
			'strike.region',
			'region.name as regionName',
		])
		.execute();
}

/** The rows on a judge's conflict sheet: the entry, school, and region conflicts the judge may see, with who entered each */
async function getJudgeConflicts(db: Database, opts: queryOpts & { judges: number[] }) {
	return await buildStrikeQuery(db, { ...opts, judgeVisible: true, types: ['entry', 'school', 'region'] })
		.leftJoin('entry', 'entry.id', 'strike.entry')
		.leftJoin('event', 'event.id', 'entry.event')
		.leftJoin('school', 'school.id', 'strike.school')
		.leftJoin('region', 'region.id', 'strike.region')
		.leftJoin('person', 'person.id', 'strike.entered_by')
		.select([
			'strike.id',
			'strike.type',
			'strike.judge',
			'strike.entered_by',
			'strike.conflictee',
			'strike.entry',
			'entry.code as entryCode',
			'entry.name as entryName',
			'event.abbr as eventAbbr',
			'strike.school',
			'school.name as schoolName',
			'strike.region',
			'region.name as regionName',
			'person.first as enteredFirst',
			'person.last as enteredLast',
		])
		.execute();
}

async function createStrike(db: Database, data: Insertable<Strike>) {
	return await db.insertInto('strike')
		.values(data)
		.returningAll()
		.executeTakeFirstOrThrow();
}

async function createStrikes(db: Database, rows: Insertable<Strike>[]) {
	if (rows.length === 0) return;
	await db.insertInto('strike').values(rows).execute();
}

async function deleteStrike(db: Database, id: number) {
	await db.deleteFrom('strike').where('strike.id', '=', id).execute();
}

async function deleteStrikes(db: Database, ids: number[]) {
	await db.deleteFrom('strike').where('strike.id', 'in', ids).execute();
}

export default {
	getStrikes,
	getJudgeStrikes,
	getJudgeConflicts,
	createStrike,
	createStrikes,
	deleteStrike,
	deleteStrikes,
};
