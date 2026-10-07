import { sql } from 'kysely';
import { verify } from 'unixcrypt';
import { db as kdb } from '../../../data/database.js';
import { BadRequest } from '../../../helpers/problem.js';
import personRepo from '../../../repos/personRepo.js';

// This name is currently a misnomer, because this doesn't actually create a
// session, it just validates the username and password Eventually, this should
// be expanded to create a session and return it

export async function login(req, res) {

	if (!req.body?.username) {
		return BadRequest(req, res, 'No username sent');
	}

	const person = await personRepo.getPersonByUsername(kdb, req.body.username);

	if (!person || typeof person !== 'object' || !person.id || !person.password) {
		return BadRequest(req, res, 'No user found for username');
	}

	const verified = verify(req.body.password, person.password);

	if (!verified) {
		return BadRequest(req, res, 'Incorrect password');
	}

	// Check account reputation - default to untrusted
	const response = {
		person_id : person.id,
		first     : person.first,
		last      : person.last,
		name      : `${person.first} ${person.last}`,
		email     : req.body.username,
		phone     : person.phone,
		pronoun   : person.pronoun,
		trusted   : false,
	};

	// Check if the account is banned, bail early if so
	const isBannedQuery = (await sql`
		SELECT COUNT(*) AS 'count'
			FROM person_setting PS
		WHERE PS.person = ${person.id}
			AND PS.tag = 'banned'
			AND PS.value = 1
	`.execute(kdb)).rows;

	if (!isBannedQuery
		|| isBannedQuery.length === 0
		|| isBannedQuery[0].count > 0
	) {
		return res.status(200).json(response);
	}

	// On a student roster for a school with at least one tournament entry at a real tourn
	const onStudentRoster = (await sql`
		SELECT COUNT(*) AS 'count'
			FROM student S
		INNER JOIN chapter C ON C.id = S.chapter
		INNER JOIN school SC ON SC.chapter = C.id
		INNER JOIN tourn T ON T.id = SC.tourn
		INNER JOIN result_set RS ON RS.tourn = T.id
		WHERE
			S.person = ${person.id}
			AND T.hidden = 0
		GROUP BY S.person
	`.execute(kdb)).rows;

	if (onStudentRoster.length > 0
		&& onStudentRoster[0].count > 0
	) {
		response.trusted = true;
		return res.status(200).json(response);
	}

	// On a judge roster for a school with at least one tournament entry at a real tourn
	const onJudgeRoster = (await sql`
		SELECT COUNT(*) AS 'count'
		FROM chapter_judge CJ
		INNER JOIN chapter C ON C.id = CJ.chapter
		INNER JOIN school SC ON SC.chapter = C.id
		INNER JOIN tourn T ON T.id = SC.tourn
		INNER JOIN result_set RS ON RS.tourn = T.id
		WHERE
			CJ.person = ${person.id}
			AND T.hidden = 0
		GROUP BY CJ.person
	`.execute(kdb)).rows;

	if (onJudgeRoster.length > 0
		&& onJudgeRoster[0].count > 0
	) {
		response.trusted = true;
		return res.status(200).json(response);
	}

	// Is a coach for a school with at least one tournament entry at a real tourn
	const isCoach = (await sql`
		SELECT COUNT(*) AS 'count'
		FROM permission P
		INNER JOIN chapter C ON C.id = P.chapter
		INNER JOIN school SC ON SC.chapter = C.id
		INNER JOIN tourn T ON T.id = SC.tourn
		INNER JOIN result_set RS ON RS.tourn = T.id
		WHERE P.person = ${person.id}
			AND P.tag = 'chapter'
			AND T.hidden = 0
		GROUP BY P.person
	`.execute(kdb)).rows;

	if (isCoach.length > 0
		&& isCoach[0].count > 0
	) {
		response.trusted = true;
		return res.status(200).json(response);
	}

	return res.status(200).json(response);
}

export default login;
