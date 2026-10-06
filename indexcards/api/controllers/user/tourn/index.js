import { db } from '../../../data/database.js';
import fineRepo from '../../../repos/fineRepo.js';
import tournRepo from '../../../repos/tournRepo.js';
import { sql } from 'kysely';

// The purpose of this function is to deliver a complete list of "things I care
// about" at a tournament. That will help sorting the relevant judges, entries,
// events, etc to the top of the stack when displaying information.

// Refactored to simplify this down, mostly because the frontend for this area
// only really needs the base IDs for the entities in question and not
// additional metadata. -- CLP

export async function getPersonTournPresence(req, res) {

	if (!req.person) {
		return res.status(200).json({ message: 'You are not logged in'});
	};

	const tournPresence = {
		me: {
			entries    : [],
			events     : [],
			judges     : [],
			categories : [],
			rounds     : [],
		},
		mine: {
			entries    : [],
			events     : [],
			judges     : [],
			categories : [],
		},
	};

	const edata = await getPersonTournEntries(req.person.id, req.params.tournId);
	const jdata = await getPersonTournJudges(req.person.id, req.params.tournId);
	const sdata = await getPersonTournSchools(req.person.id, req.params.tournId);

	// Unique lists of stuff that is me as an individual
	Object.keys(tournPresence.me).forEach( (key) => {
		tournPresence.me[key] = Array.from(new Set([
			...edata[key],
			...jdata[key],
		]));
	});

	// Unique lists of stuff that is mine as a coach
	Object.keys(tournPresence.mine).forEach( (key) => {
		tournPresence.mine[key] =Array.from(new Set(sdata[key])).filter( ( mine ) => {
			return !tournPresence.me[key].includes( mine );
		});
	});
	return res.status(200).json(tournPresence);
};

export const getPersonTournEntries = async (personId, tournId) => {

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

	const edata = {
		entries    : [],
		events     : [],
		judges     : [],
		categories : [],
		rounds     : [],
	};

	edata.entries = entryArray.map( (entry) => entry.id );
	edata.events  = entryArray.map( (entry) => entry.event );
	return edata;
};

export const getPersonTournJudges = async (personId, tournId) => {

	const judgeArray = await db
    .selectFrom('judge')
    .innerJoin('category', 'category.id', 'judge.category')
    .select([
        'judge.id',
        'judge.category',
        'judge.alt_category as altCategory',
        (eb) =>
            eb
                .selectFrom('ballot')
                .innerJoin('panel', 'panel.id', 'ballot.panel')
                .innerJoin('round', 'round.id', 'panel.round')
                .select(
                    sql`GROUP_CONCAT(DISTINCT ${sql.ref('round.event')})`
                )
                .whereRef('ballot.judge', '=', 'judge.id')
                .as('events'),
        (eb) =>
            eb
                .selectFrom('ballot')
                .innerJoin('panel', 'panel.id', 'ballot.panel')
                .innerJoin('round', 'round.id', 'panel.round')
                .select(
                    sql`GROUP_CONCAT(DISTINCT ${sql.ref('round.id')})`
                )
                .whereRef('ballot.judge', '=', 'judge.id')
                .as('rounds'),
    ])
    .where('judge.person', '=', personId)
    .where('category.tourn', '=', tournId)
    .execute();

	const jdata = {
		judges     : [],
		categories : [],
		events     : [],
		entries    : [],
		rounds     : [],
	};

	judgeArray.forEach( (judge) => {
		jdata.judges.push(judge.id);
		jdata.categories.push(judge.category);
		if (judge.altCategory) jdata.categories.push(judge.category);
		if (judge.events) jdata.events.push(...judge.events.split(',').map(Number));
		if (judge.rounds) jdata.rounds.push(...judge.rounds.split(',').map(Number));
	});
	return jdata;
};

export const getPersonTournSchools = async (personId, tournId) => {
	const schoolArray = await db
    .selectFrom('school')
    .leftJoin('entry', (join) =>
        join
            .onRef('entry.school', '=', 'school.id')
            .on('entry.active', '=', 1)
    )
    .leftJoin('judge', 'judge.school', 'school.id')
    .leftJoin('category', 'category.id', 'judge.category')
    .leftJoin('event', 'event.id', 'entry.event')
    .select([
        'school.id',
        sql`GROUP_CONCAT(${sql.ref('entry.id')})`.as('entries'),
        sql`GROUP_CONCAT(${sql.ref('event.id')})`.as('events'),
        sql`GROUP_CONCAT(${sql.ref('category.id')})`.as('categories'),
        sql`GROUP_CONCAT(${sql.ref('judge.id')})`.as('judges'),
    ])
    .where('school.tourn', '=', tournId)
    .where((eb) =>
        eb.or([
            eb.exists(
                eb
                    .selectFrom('contact')
                    .select('contact.id')
                    .whereRef('contact.school', '=', 'school.id')
                    .where('contact.person', '=', personId)
                    .where((eb) =>
                        eb.or([
                            eb('contact.official', '=', 1),
                            eb('contact.onsite', '=', 1),
                        ])
                    )
            ),
            eb.exists(
                eb
                    .selectFrom('permission')
                    .select('permission.id')
                    .whereRef('permission.chapter', '=', 'school.chapter')
                    .where('permission.person', '=', personId)
                    .where('permission.tag', '=', 'chapter')
            ),
        ])
    )
    .groupBy('school.id')
    .execute();

	const sdata = {
		schools    : [],
		entries    : [],
		judges     : [],
		categories : [],
		events     : [],
	};

	schoolArray.forEach( (school) => {
		sdata.schools.push(school.id);
		if (school.entries) sdata.entries.push(...school.entries.split(',').map(Number));
		if (school.judges) sdata.judges.push(...school.judges.split(',').map(Number));
		if (school.events) sdata.events.push(...school.events.split(',').map(Number));
		if (school.categories) sdata.categories.push(...school.categories.split(',').map(Number));
	});
	return sdata;
};

export async function getPersonTourns(req, res){
	const { endAfter } = req.query;
	const data = await tournRepo.getPersonTourns(db,req.actor.id, {
		endAfter,
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
};

export async function getTournSummary(req,res){
	const tourn = await tournRepo.getPersonTournSummary(db,req.actor.id,req.params.tournId);
	let roles = [];
	let livedocs = [];
	if(tourn.judges.length > 0)
		roles.push('judge');
	if(tourn.entries.length > 0)
		roles.push('student');
	if(tourn.coaches.length > 0)
		roles.push('coach');

	for(const judge of tourn.judges){
		if (judge.livedoc_url) {
			livedocs.push({
				categoryId: judge.category_id,
				categoryName: judge.category_name,
				url: judge.livedoc_url,
				caption: judge.livedoc_caption,
			});
		}
	}

	return res.json({
		id: tourn.tourn_id,
		roles: roles,
		livedocs,
	});
}
export async function getTournFines(req,res){
	const { tournId } = req.params;
	const data = await fineRepo.getFines(db,req.actor.id,tournId);

	return res.json(data.map((row) => ({
		id: row.id,
		reason: row.reason,
		amount: row.amount === null ? null : Number(row.amount),
		currency: row.currency,
		school: row.school,
		schoolName: row.schoolName,
		leviedAt: row.leviedAt,
	})));
};

export async function getTournBallots(req,res){

	return res.status(501).send();
};
