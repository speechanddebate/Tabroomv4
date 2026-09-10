// @ts-ignore
import { startOfYear } from '@speechanddebate/nsda-js-utils';
import { BadRequest, NotFound } from '../../helpers/problem.js';
import { db } from '../../data/database.js';
import { sql, type SqlBool } from 'kysely';

import type { Request, Response } from 'express';

export async function getPersonChapters(req: Request, res: Response) {
	const personId = Number(req.query.person_id);

    const student = await db
        .selectFrom('chapter as C')
        .innerJoin('student as S', 'S.chapter', 'C.id')
        .select(['C.id', 'C.name', 'C.state'])
        .distinct()
        .where('S.person', '=', personId)
        .execute();

    const advisor = await db
        .selectFrom('chapter as C')
        .innerJoin('permission as P', join =>
            join
                .onRef('P.chapter', '=', 'C.id')
                .on('P.tag', '=', 'chapter')
        )
        .select(['C.id', 'C.name', 'C.state'])
        .distinct()
        .where('P.person', '=', personId)
        .execute();

    return res.status(200).json([...student, ...advisor]);
};
export async function getPersonRounds(req: Request, res: Response) {
	if (!req.query.person_id && !req.query.slug) {
		return BadRequest(req, res, 'One of person_id or slug is required');
	}

    let ids: number[];

	// If person_id is provided, look up that person's rounds
	// The ID is provided by the caselist after authentication, so this only allows a user to
	// look up their own rounds, not an arbitrary person_id
	if (req.query.person_id) {
		ids = [Number(req.query.person_id)];
	} else {
		const slug = String(req.query.slug ?? '');
		// If no person_id provided, look up any linked person_id's based on the slug
		// This allows looking up other people's rounds if they've opted in to linking themselves to a page
        const persons = await db
            .selectFrom('caselist as C')
            .select('C.person')
            .distinct()
            .where('C.slug', '=', slug)
            .execute();

        if (!persons || persons.length < 1 || !persons[0].person) {
			return NotFound(req, res, 'No caselist links found');
		}
        ids = persons.map(p => p.person);
	}

    let roundsQuery = db
        .selectFrom('panel as P')
        .innerJoin('ballot as B', 'B.panel', 'P.id')
        .innerJoin('judge as J', 'J.id', 'B.judge')
        .innerJoin('round as R', 'R.id', 'P.round')
        .innerJoin('event as E', 'R.event', 'E.id')
        .innerJoin('tourn as T', 'T.id', 'E.tourn')
        .innerJoin('entry as EN', 'EN.id', 'B.entry')
        .innerJoin('entry_student as ES', 'ES.entry', 'EN.id')
        .innerJoin('student as S', 'S.id', 'ES.student')
        .innerJoin('person as PN', 'PN.id', 'S.person')
        .innerJoin('ballot as OB', join =>
            join
                .onRef('OB.panel', '=', 'P.id')
                .onRef('OB.id', '!=', 'B.id')
        )
        .innerJoin('entry as O', 'O.id', 'OB.entry')
        .leftJoin('panel_setting as PS', join =>
            join
                .onRef('PS.panel', '=', 'P.id')
                .on('PS.tag', '=', 'share')
        )
        .select([
            'P.id as id',
            'T.name as tournament',
            sql<string>`COALESCE(NULLIF(R.label, ''), NULLIF(R.name, ''), NULLIF(R.type, ''), 'X')`.as('round'),
            sql<string>`CASE WHEN B.side = 1 THEN 'A' ELSE 'N' END`.as('side'),
            'O.code as opponent',
            sql<string | null>`GROUP_CONCAT(DISTINCT J.last)`.as('judge'),
            'R.start_time as start',
            sql<string | null>`CASE WHEN R.start_time > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY) THEN PS.value ELSE NULL END`.as('share'),
        ])
        .distinct()
        .where('PN.id', 'in', ids)
        .where('R.published', '=', 1)
        .where('E.type', '=', 'debate')
        .where('T.hidden', '!=', 1)
        .where(sql<SqlBool>`T.start > ${`${startOfYear}-08-01 00:00:00`}`)
        .where(sql<SqlBool>`T.start < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)`)
        .groupBy('P.id')
        .orderBy('R.start_time', 'desc');

    if (req.query.current) {
        roundsQuery = roundsQuery.where(sql<SqlBool>`R.start_time > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 HOUR)`);
    }

    let rounds = await roundsQuery.execute();
    rounds = rounds.filter(r => r.id);
	rounds.forEach(r => {
		const numeric = parseInt(r.round?.replace(/[^\d]/g, '')?.trim()) || 0;
		if (numeric > 0 && numeric < 10) {
			r.round = numeric.toString();
		} else {
			if (r.round?.toLowerCase()?.includes('quad')) { r.round = 'Quads'; }
			if (r.round?.toLowerCase()?.includes('qd')) { r.round = 'Quads'; }
			if (r.round?.toLowerCase()?.includes('qd')) { r.round = 'Quads'; }
			if (r.round?.toLowerCase()?.includes('128')) { r.round = 'Quads'; }
			if (r.round?.toLowerCase()?.includes('tri')) { r.round = 'Triples'; }
			if (r.round?.toLowerCase()?.includes('trp')) { r.round = 'Triples'; }
			if (r.round?.toLowerCase()?.includes('64')) { r.round = 'Triples'; }
			if (r.round?.toLowerCase()?.includes('dou')) { r.round = 'Doubles'; }
			if (r.round?.toLowerCase()?.includes('dbl')) { r.round = 'Doubles'; }
			if (r.round?.toLowerCase()?.includes('32')) { r.round = 'Doubles'; }
			if (r.round?.toLowerCase()?.includes('oct')) { r.round = 'Octas'; }
			if (r.round?.toLowerCase()?.includes('16')) { r.round = 'Octas'; }
			if (r.round?.toLowerCase()?.includes('quar')) { r.round = 'Quarters'; }
			if (r.round?.toLowerCase()?.includes('qrt')) { r.round = 'Quarters'; }
			if (r.round?.toLowerCase()?.includes('sem')) { r.round = 'Semis'; }
			if (r.round?.toLowerCase()?.includes('fin')) { r.round = 'Finals'; }
		}
	});

	// Remove share link if looking up another person's rounds,
	// share links should only be accessible by the person themselves
    if (!req.query.person_id || req.query.slug) {
        const roundsWithoutShare = rounds.map(({ share: _share, ...round }) => round);
        return res.status(200).json(roundsWithoutShare);
	}

	return res.status(200).json(rounds);
};

export async function getPersonStudents(req: Request, res: Response) {
    const personId = Number(req.query.person_id);

	// Get all students on the same roster as the person,
	// but limit to students with future entries with a chapter with future tourns
	// to limit out camp and observer-only chapters
    const students = await db
        .selectFrom('student as S')
        .innerJoin('chapter as C', 'C.id', 'S.chapter')
        .innerJoin('entry_student as ES', 'ES.student', 'S.id')
        .innerJoin('entry as E', 'E.id', 'ES.entry')
        .innerJoin('tourn as T', 'T.id', 'E.tourn')
        .select([
            'S.id',
            'S.first',
            'S.last',
            sql<string>`CONCAT(S.first, ' ', S.last)`.as('name'),
        ])
        .distinct()
        .where(sql<SqlBool>`C.id IN (
            SELECT DISTINCT chapter FROM student S2 WHERE S2.retired = 0 AND S2.person = ${personId}
            UNION ALL SELECT DISTINCT chapter FROM chapter_judge CJ WHERE CJ.retired = 0 AND CJ.person = ${personId}
            GROUP BY chapter
        )`)
        .where('S.retired', '=', 0)
        .where('T.hidden', '!=', 1)
        .where(sql<SqlBool>`T.start >= CURRENT_TIMESTAMP`)
        .groupBy(['S.last', 'S.first'])
        .orderBy('S.last')
        .orderBy('S.first')
        .execute();

    return res.status(200).json(students);
};

export async function postCaselistLink(req: Request, res: Response) {
    await db
        .insertInto('caselist')
        .values({
            slug: String(req.body.slug).trim(),
            eventcode: parseInt(String(req.body.eventcode)) || 0,
            person: Number(req.body.person_id),
        })
        .execute();

	return res.status(201).json({ message: 'Successfully created caselist link' });
};