// import { showDateTime } from '../../../helpers/common';

import { NotImplemented, UnexpectedError } from '../../../helpers/problem.js';
import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';
import { summon } from '../../../repos/utils/index.js';

// General CRUD for the jpool itself
// Get jpool (read)
export async function getJPool(req, res) {
	const jpool = await summon(kdb, 'jpool',req.params.jpoolId);
	res.status(200).json(jpool);
}

// Update jpool (update). Never worked: it called update() on a plain object.
export async function updateJPool(req, res) {
	return NotImplemented(req, res, 'Updating a judge pool is not yet implemented');
}

// Delete jpool
export async function deleteJPool(req, res) {
	try {
		await kdb.deleteFrom('jpool')
			.where('id', '=', req.params.jpoolId)
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}

	res.status(200).json({
		error: false,
		message: 'Judge pool deleted',
	});
}

// CRUD for the judges in the jpool.  Almost entirely consists of removing
// or creating jpool_judge relationships.

// Update a single judge.  Only POST and DELETE needed here.
// Add judge to jpool (create)
export async function createJPoolJudge(req, res) {
	try {
		await kdb.insertInto('jpool_judge')
			.ignore()
			.values({ jpool: req.params.jpoolId, judge: req.params.judgeId })
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}
	res.status(200).json({ error: false, message: 'Judge added to pool' });
}

// Remove judge from jpool
export async function deleteJPoolJudge(req, res) {
	await kdb.deleteFrom('jpool_judge')
		.where('jpool', '=', req.params.jpoolId)
		.where('judge', '=', req.params.judgeId)
		.execute();
	res.status(200).json({ error: false, message: 'Judge removed from pool' });
}

// Update a bunch of judges
// Get judges in jpool (read)
export async function getJPoolJudges(req, res) {
	const { rows: judges } = await sql`select judge.* from judge, jpool_judge jpj where judge.id = jpj.judge and jpj.jpool = ${req.params.jpoolId}`.execute(kdb);
	res.status(200).json(judges);
}

// Add judges to jpool (create)
export async function createJPoolJudges(req, res) {
	let errs = '';
	for (const judgeId of req.body.judges) {
		try {
			await kdb.insertInto('jpool_judge')
				.ignore()
				.values({ jpool: req.params.jpoolId, judge: judgeId })
				.execute();
		} catch (err) {
			errs += err;
		}
	}
	if (errs) {
		return UnexpectedError(req, res, errs);
	}
	res.status(200).json('Judges added to pool');
}

// Remove all judges from jpool
export async function deleteJPoolJudges(req, res) {
	await kdb.deleteFrom('jpool_judge')
		.where('jpool', '=', req.params.jpoolId)
		.execute();
	res.status(200).json('All judges removed from pool');
}

// CRUD for the rounds in the jpool.  Almost entirely consists of removing
// or creating jpool_round relationships.

// Update a single round.  Only POST and DELETE needed here.

// Add round to jpool (create)
export async function createJPoolRound(req, res) {
	try {
		await kdb.insertInto('jpool_round')
			.ignore()
			.values({ jpool: req.params.jpoolId, round: req.params.roundId })
			.execute();
	} catch (err) {
		return UnexpectedError(req, res, err.message);
	}
	res.status(200).json('Round added to pool');
}

// Remove round from jpool
export async function deleteJPoolRound(req, res) {
	await kdb.deleteFrom('jpool_round')
		.where('jpool', '=', req.params.jpoolId)
		.where('round', '=', req.params.roundId)
		.execute();
	res.status(200).json({ error: false, message: 'Round removed from pool' });
}

// Update a bunch of rounds

// Get rounds in jpool (read)
export async function getJPoolRounds(req, res) {
	const { rows: rounds } = await sql`select round.* from round, jpool_round jpr where round.id = jpr.round and jpr.jpool = ${req.params.jpoolId}`.execute(kdb);
	res.status(200).json(rounds);
}

// Add rounds to jpool (create)
export async function createJPoolRounds(req, res) {
	let errs = '';
	for (const roundId of req.body.rounds) {
		try {
			await kdb.insertInto('jpool_round')
				.ignore()
				.values({ jpool: req.params.jpoolId, round: roundId })
				.execute();
		} catch (err) {
			errs += err;
		}
	}
	if (errs) {
		return UnexpectedError(req, res, errs);
	}
	res.status(200).json('Rounds added to pool');
}

// Remove all rounds from jpool
export async function deleteJPoolRounds(req, res) {
	await kdb.deleteFrom('jpool_round')
		.where('jpool', '=', req.params.jpoolId)
		.execute();
	res.status(200).json('All rounds removed from pool');
}
