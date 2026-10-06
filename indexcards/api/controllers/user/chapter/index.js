import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import * as schools from './school.js';
async function userChapters(req,res) {
	const { rows: chapters } = await sql`
		select
			chapter.*,
			permission.tag permission
		from (permission, chapter)
		where 1=1
			and permission.person = ${req.person.id}
			and permission.chapter = chapter.id
		group by chapter.id
	`.execute(kdb);

	return res.status(200).json(chapters);
};

async function userChaptersByTourn(req, res)  {
	const { rows: chapters } = await sql`
			select
				chapter.*,
				permission.tag permission,
				school.id schoolId, school.tourn tournId,
				school.code schoolCode, school.onsite
			from (permission, chapter)
				left join school
					on school.chapter = chapter.id
					and school.tourn = ${req.params.tournId}
			where 1=1
				and permission.person = ${req.person.id}
				and permission.chapter = chapter.id
			group by chapter.id
		`.execute(kdb);

	const chapterIds = chapters.map( (chapter) => chapter.id );

	if (chapterIds.length < 1) {
		// Avoids null error below. There is no chapter 1.
		chapterIds.push(1);
	}

	const { rows: dashboards } = await sql`
			select
				chapter.*,
				school.id schoolId, school.tourn tournId,
				school.code schoolCode, school.onsite,
				'dashboard' as permission
			from (contact, school, chapter)
				where 1 = 1
				and contact.person   = ${req.person.id}
				and contact.school   = school.id
				and school.tourn     = ${req.params.tournId}
				and contact.official = 1
				and school.chapter   = chapter.id
				and chapter.id NOT IN ( ${sql.join(chapterIds)} )
				group by chapter.id
		`.execute(kdb);

	chapters.push(...dashboards);

	const schoolIds = chapters
		.map( (chapter) => chapter.schoolId )
		.filter( (schoolId) => schoolId );

	const events = schoolIds.length < 1 ? [] : await kdb
		.selectFrom('event')
		.innerJoin('entry', 'entry.event', 'event.id')
		.select(['event.id', 'event.type', 'event.name', 'event.abbr'])
		.where('event.tourn', '=', req.params.tournId)
		.where('entry.active', '=', 1)
		.where('entry.school', 'in', schoolIds)
		.orderBy('event.type')
		.orderBy('event.abbr')
		.execute();

	return res.status(200).json({
		chapters,
		events,
	});
};

export default {
	userChapters,
	userChaptersByTourn,
	...schools,
};
