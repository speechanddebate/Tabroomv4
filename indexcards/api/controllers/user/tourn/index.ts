import type { Response } from 'express';
import { sql } from 'kysely';
import type { PersonTournPresence, PersonTournSummary } from '@tabroom/types';
import { db } from '../../../data/database.js';
import fineRepo from '../../../repos/fineRepo.js';
import judgeRepo from '../../../repos/judgeRepo.js';
import schoolRepo from '../../../repos/schoolRepo.js';
import tournRepo from '../../../repos/tournRepo.js';
import { NotFound } from '../../../helpers/problem.js';
import { getPerson } from '../../../middleware/auth/authorization.js';
import type { ValidatedRequest } from '../../../middleware/validation.js';

type MeKey = keyof PersonTournPresence['me'];
type MineKey = keyof PersonTournPresence['mine'];
type IdLists = Record<MeKey, number[]>;

const emptyIdLists = (): IdLists => ({ entries: [], events: [], judges: [], categories: [], rounds: [] });

/** GROUP_CONCAT comes back as a comma separated string, or null when nothing matched */
const splitIds = (ids: string | null) => (ids ? ids.split(',').map(Number) : []);

// The purpose of this function is to deliver a complete list of "things I care
// about" at a tournament. That will help sorting the relevant judges, entries,
// events, etc to the top of the stack when displaying information.

// Refactored to simplify this down, mostly because the frontend for this area
// only really needs the base IDs for the entities in question and not
// additional metadata. -- CLP

export async function getPersonTournPresence(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const tournId: number = req.params.tournId;

	const [edata, jdata, sdata] = await Promise.all([
		getPersonTournEntries(person.id, tournId),
		getPersonTournJudges(person.id, tournId),
		getPersonTournSchools(person.id, tournId),
	]);

	// Unique lists of stuff that is me as an individual
	const me = emptyIdLists();
	for (const key of Object.keys(me) as MeKey[]) {
		me[key] = Array.from(new Set([...edata[key], ...jdata[key]]));
	}

	// Unique lists of stuff that is mine as a coach
	const mine: PersonTournPresence['mine'] = { entries: [], events: [], judges: [], categories: [] };
	for (const key of Object.keys(mine) as MineKey[]) {
		mine[key] = Array.from(new Set(sdata[key])).filter((id) => !me[key].includes(id));
	}

	const tournPresence: PersonTournPresence = { me, mine };
	return res.status(200).json(tournPresence);
}

export const getPersonTournEntries = async (personId: number, tournId: number): Promise<IdLists> => {
	const entryArray = await db.selectFrom('entry')
		.innerJoin('entry_student as es', 'entry.id', 'es.entry')
		.innerJoin('event', 'entry.event', 'event.id')
		.innerJoin('student', 'es.student', 'student.id')
		.where('event.tourn', '=', tournId)
		.where('event.type', '!=', 'attendee')
		.where('entry.active', '=', 1)
		.where('student.person', '=', personId)
		.select(['entry.id', 'entry.event'])
		.execute();

	const edata = emptyIdLists();
	edata.entries = entryArray.map((entry) => entry.id);
	edata.events = entryArray.flatMap((entry) => (entry.event === null ? [] : [entry.event]));
	return edata;
};

export const getPersonTournJudges = async (personId: number, tournId: number): Promise<IdLists> => {
	const judgeArray = await db
		.selectFrom('judge')
		.innerJoin('category', 'category.id', 'judge.category')
		.select([
			'judge.id',
			'judge.category',
			'judge.alt_category as altCategory',
			(eb) => eb
				.selectFrom('ballot')
				.innerJoin('panel', 'panel.id', 'ballot.panel')
				.innerJoin('round', 'round.id', 'panel.round')
				.select(sql<string | null>`GROUP_CONCAT(DISTINCT ${sql.ref('round.event')})`.as('events'))
				.whereRef('ballot.judge', '=', 'judge.id')
				.as('events'),
			(eb) => eb
				.selectFrom('ballot')
				.innerJoin('panel', 'panel.id', 'ballot.panel')
				.innerJoin('round', 'round.id', 'panel.round')
				.select(sql<string | null>`GROUP_CONCAT(DISTINCT ${sql.ref('round.id')})`.as('rounds'))
				.whereRef('ballot.judge', '=', 'judge.id')
				.as('rounds'),
		])
		.where('judge.person', '=', personId)
		.where('category.tourn', '=', tournId)
		.execute();

	const jdata = emptyIdLists();
	for (const judge of judgeArray) {
		jdata.judges.push(judge.id);
		if (judge.category !== null) jdata.categories.push(judge.category);
		// the alt category is listed as the category too, as it always has been
		if (judge.altCategory && judge.category !== null) jdata.categories.push(judge.category);
		jdata.events.push(...splitIds(judge.events));
		jdata.rounds.push(...splitIds(judge.rounds));
	}
	return jdata;
};

export const getPersonTournSchools = async (personId: number, tournId: number): Promise<IdLists & { schools: number[] }> => {
	const schoolArray = await db
		.selectFrom('school')
		.leftJoin('entry', (join) => join
			.onRef('entry.school', '=', 'school.id')
			.on('entry.active', '=', 1)
		)
		.leftJoin('judge', 'judge.school', 'school.id')
		.leftJoin('category', 'category.id', 'judge.category')
		.leftJoin('event', 'event.id', 'entry.event')
		.select([
			'school.id',
			sql<string | null>`GROUP_CONCAT(${sql.ref('entry.id')})`.as('entries'),
			sql<string | null>`GROUP_CONCAT(${sql.ref('event.id')})`.as('events'),
			sql<string | null>`GROUP_CONCAT(${sql.ref('category.id')})`.as('categories'),
			sql<string | null>`GROUP_CONCAT(${sql.ref('judge.id')})`.as('judges'),
		])
		.where('school.tourn', '=', tournId)
		.where((eb) => eb.or([
			eb.exists(
				eb.selectFrom('contact')
					.select('contact.id')
					.whereRef('contact.school', '=', 'school.id')
					.where('contact.person', '=', personId)
					.where((cb) => cb.or([
						cb('contact.official', '=', 1),
						cb('contact.onsite', '=', 1),
					]))
			),
			eb.exists(
				eb.selectFrom('permission')
					.select('permission.id')
					.whereRef('permission.chapter', '=', 'school.chapter')
					.where('permission.person', '=', personId)
					.where('permission.tag', '=', 'chapter')
			),
		]))
		.groupBy('school.id')
		.execute();

	const sdata = { ...emptyIdLists(), schools: [] as number[] };
	for (const school of schoolArray) {
		sdata.schools.push(school.id);
		sdata.entries.push(...splitIds(school.entries));
		sdata.judges.push(...splitIds(school.judges));
		sdata.events.push(...splitIds(school.events));
		sdata.categories.push(...splitIds(school.categories));
	}
	return sdata;
};

export async function getPersonTourns(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const endAfter: string | undefined = req.query.endAfter;
	const data = await tournRepo.getPersonTourns(db, person.id, {
		endAfter: endAfter ? new Date(endAfter) : undefined,
		unpublished: false,
	});
	const tourns = data.map((row) => ({
		id: row.id,
		name: row.name,
		city: row.city,
		state: row.state,
		country: row.country,
		tz: row.tz,
		webname: row.webname,
		hidden: row.hidden,
		start: row.start,
		end: row.end,
		reg_start: row.reg_start,
		reg_end: row.reg_end,
		timestamp: row.timestamp,
	}));

	return res.json(tourns);
}

export async function getTournSummary(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const tournId: number = req.params.tournId;
	const tourn = await tournRepo.getPersonTournSummary(db, person.id, tournId);
	if (!tourn) return NotFound(req, res, 'Tournament not found');

	const roles: PersonTournSummary['roles'] = [];
	if (tourn.judges.length > 0) roles.push('judge');
	if (tourn.entries.length > 0) roles.push('student');
	if (tourn.coaches.length > 0) roles.push('coach');

	const livedocs: PersonTournSummary['livedocs'] = [];
	for (const judge of tourn.judges) {
		if (judge.livedoc_url && judge.category_id !== null) {
			livedocs.push({
				categoryId: judge.category_id,
				categoryName: judge.category_name,
				url: judge.livedoc_url,
				caption: judge.livedoc_caption,
			});
		}
	}

	const summary: PersonTournSummary = { id: tourn.tourn_id, roles, livedocs };
	return res.json(summary);
}

export async function getTournFines(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const tourns: number[] = [req.params.tournId];
	// the fines the person may see are keyed by the judges and schools they hold at the tourn
	const [judges, schools] = await Promise.all([
		judgeRepo.getPersonJudges(db, person.id, { tourns }),
		schoolRepo.getCoachedSchools(db, person.id, { tourns }),
	]);
	const data = await fineRepo.getFines(db, {
		person: person.id,
		tourns,
		judges: judges.map((judge) => judge.id),
		schools: schools.filter((school) => school.tag === 'chapter').map((school) => school.id),
	});

	return res.json(data.map((row) => ({
		id: row.id,
		reason: row.reason,
		amount: row.amount === null ? null : Number(row.amount),
		currency: row.currency,
		school: row.school,
		schoolName: row.schoolName,
		judge: row.judge,
		Judge: row.judge === null ? null : { first: row.judgeFirst, last: row.judgeLast },
		leviedAt: row.leviedAt,
	})));
}

export async function getTournBallots(_req: ValidatedRequest, res: Response) {
	return res.status(501).send();
}
