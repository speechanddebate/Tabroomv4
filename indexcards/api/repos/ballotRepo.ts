import type { Database } from '../data/database.js';
import type { Insertable } from 'kysely';
import type { Ballot } from '../data/schema.js';

type queryOpts = {
	winnerBallot?: boolean;
	panel?: number;
	judge?: number;
};
function buildBallotQuery(db: Database, opts: queryOpts = {}){
	let query  = db.selectFrom('ballot');

	query = opts.panel ? query.where('panel', '=', opts.panel) : query;
	query = opts.judge ? query.where('judge', '=', opts.judge) : query;
	if (opts.winnerBallot) {
		query = query.innerJoin('score', 'ballot.id', 'score.ballot')
		.where('score.tag', '=', 'winloss')
		.where('score.value', '=', 1);
	}
	return query;
}

export async function getBallot(db: Database, id: number, opts: queryOpts = {}) {
	return await buildBallotQuery(db, opts)
	.selectAll('ballot')
	.where('ballot.id', '=', id)
	.executeTakeFirst();
}

export async function getBallots(db: Database, opts: queryOpts = {}) {
	return await buildBallotQuery(db, opts)
	.selectAll('ballot')
	.execute();
}
export async function createBallot(db: Database, data: Insertable<Ballot> = {}){
	return await db.insertInto('ballot')
	.values(data)
	.returningAll()
	.executeTakeFirstOrThrow();
}

export default {
	getBallot,
	getBallots,
	createBallot,
};