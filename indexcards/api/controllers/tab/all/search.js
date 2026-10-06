import { sql } from 'kysely';
import { db } from '../../../data/database.js';

export const searchAttendees = async (req, res) => {
	if (typeof req.params.searchString !== 'string') {
		res.status(201).json({ message: 'Nothing to search' });
	}
	// Query parameters shared by the three searches below
	const replacements = {
		tournId          : req.params.tournId,
		searchString     : req.params.searchString,
		likeString       : `${req.params.searchString}%`,
		doubleLikeString : `%${req.params.searchString}%`,
	};

	const entries = (await sql`
		select
			student.id, student.first, student.last,
			entry.id entry, entry.code, entry.name, event.abbr, school.name schoolName, school.id schoolId, 'entry' as tag
		from (entry, event, entry_student es, student)
			left join school on school.id = entry.school
		where event.tourn = ${replacements.tournId}
			and event.id = entry.event
			and entry.unconfirmed = 0
			and entry.id = es.entry
			and es.student = student.id
			and (student.last LIKE ${replacements.likeString} OR entry.code LIKE ${replacements.doubleLikeString})
		group by entry.id
	`.execute(db)).rows;

	const judges = (await sql`
		select
			judge.id, judge.code, judge.first, judge.last, category.abbr, school.name schoolName, school.id schoolId, 'judge' as tag
		from (judge, category)
			left join school on school.id = judge.school
		where category.tourn = ${replacements.tournId}
			and category.id = judge.category
			and (judge.last LIKE ${replacements.likeString} OR judge.code = ${replacements.searchString})
	`.execute(db)).rows;

	const schools = (await sql`
		select
			school.id, school.code, school.name, count(distinct entry.id) as entries, count(distinct judge.id) as judges, 'school' as tag
		from school
			left join entry on entry.school = school.id and entry.unconfirmed = 0
			left join judge on judge.school = school.id
		where school.tourn = ${replacements.tournId}
			and (school.name LIKE ${replacements.likeString} OR school.code = ${replacements.searchString})
		group by school.id
	`.execute(db)).rows;

	const exactMatches = [];
	const partialMatches = [];

	[...schools, ...judges, ...entries].forEach( (result) => {
		if (
			(result.code && result.code === req.params.searchString)
			|| (result.last && result.last === req.params.searchString)
			|| result.name === req.params.searchString
		) {
			exactMatches.push(result);
		} else {
			partialMatches.push(result);
		}
	});

	res.status(200).json({ exactMatches, partialMatches });
};