// Functions that deliver information about the schools a user's chapter may be
// registered into for the public facing sides of Tabroom when a login session
// is present.

import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';

export async function getMyChaptersNonTourn(req, res) {
	if (!req.person) {
		return res.status(201).json([]);
	}

	const { rows: tournChapters } = await sql`
		select
			chapter.id, chapter.name
		from (chapter, permission)
		where 1=1
			and permission.person = ${req.person.id}
			and permission.chapter = chapter.id
			and permission.tag = 'chapter'
			and NOT EXISTS (
				select school.id
					from school
				where 1=1
					and school.chapter = chapter.id
					and school.tourn = ${req.params.tournId}
			)
		group by chapter.id
		order by chapter.name
	`.execute(kdb);

	return res.status(200).json(tournChapters);
};

export async function getMySchoolsByTourn(req, res) {
	if (!req.person) {
		return res.status(201).json([]);
	}

	const { rows: tournSchools } = await sql`
		select
			school.id, school.name, school.code,
			school.onsite, school.chapter
		from (school)
		where 1=1
			and school.tourn = ${req.params.tournId}
			and (
				EXISTS (
					select perm.id
						from (permission perm, chapter)
					where 1=1
						and perm.person = ${req.person.id}
						and perm.chapter = chapter.id
						and perm.tag = 'chapter'
						and chapter.id = school.chapter
				) OR EXISTS (
					select contact.id
						from contact
					where 1=1
						and contact.school = school.id
						and contact.person = ${req.person.id}
						and (contact.official = 1 OR contact.onsite = 1)
				)
			)
		group by school.id
		order by school.name
		limit 5
	`.execute(kdb);

	const schoolIds = tournSchools.map( (school) => school.id );
	const chapterIds = tournSchools.map( (school) => school.chapter );

	if (schoolIds.length > 0) {

		// Discover roster by student and chapter to account for hybrid
		// entries

		const { rows: tournStudents } = await sql`
			select
				student.id, student.first, student.middle, student.last,
				entry.code, student.chapter, entry.event
			from (student, entry_student es, entry, school)
			where 1=1
				and school.tourn = ${req.params.tournId}
				and school.id = entry.school
				and entry.active = 1
				and entry.id = es.entry
				and es.student = student.id
				and student.chapter IN (${sql.join(chapterIds)})
			group by student.id
			order by student.last
		`.execute(kdb);

		const tournJudges = await kdb
			.selectFrom('judge')
			.innerJoin('category', 'category.id', 'judge.category')
			.select([
				'judge.id', 'judge.first', 'judge.last', 'judge.code', 'judge.school',
				'judge.category', 'category.abbr as categoryAbbr', 'category.name as categoryName',
			])
			.where('judge.school', 'in', schoolIds)
			.execute();

		const tournEntries = await kdb
			.selectFrom('entry')
			.innerJoin('event', 'event.id', 'entry.event')
			.select([
				'entry.school', 'entry.id', 'entry.name', 'entry.code',
				'entry.event', 'event.name as eventName', 'event.abbr as eventAbbr',
			])
			.where('entry.school', 'in', schoolIds)
			.where('entry.active', '=', 1)
			.execute();

		// This seems inefficient but the vast majority of cases involve just
		// one school and one entry and for those weird edges it's usually a
		// league admin thus the limit 5 in the query above.

		for (const school of tournSchools) {

			const entries = tournEntries.filter( entry => entry.school === school.id );
			const judges = tournJudges.filter( judge => judge.school === school.id );
			school.students = tournStudents.filter( student => student.chapter === school.chapter);

			school.entries = {};
			school.events = {};
			school.judges = {};

			for (const judge of judges) {
				delete judge.school;
				school.judges[judge.id] = { ...judge};
			}

			for (const entry of entries) {
				if (!school.events[entry.event]) {
					school.events[entry.event] = {
						name: entry.eventName,
						abbr: entry.eventAbbr,
					};
				}
				school.entries[entry.id] = {
					code      : entry.code,
					name      : entry.name,
					event     : entry.event,
					eventAbbr : entry.eventAbbr,
				};
			}
		}
	}

	return res.status(200).json(tournSchools);
};