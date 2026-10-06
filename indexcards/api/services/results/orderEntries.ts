/* This service calculates the entries in order of the tiebreakers of a given
 * round ID, which INCLUDES the results from that round, if any. */

/* This service is for tournament admins only and cannot be exposed to the
 * public interfaces */

import { db } from '../../data/database.js';

export const entriesInOrder = async (roundId: number) => {
	const resultsData = await db
	.selectFrom('entry')
	.innerJoin('ballot', 'ballot.entry', 'entry.id')
	.innerJoin('panel', 'panel.id', 'ballot.panel')
	.innerJoin('round', 'round.id', 'panel.round')
	.innerJoin('round as sample', 'sample.event', 'round.event')
	.leftJoin('score', (join) =>
		join
			.onRef('score.ballot', '=', 'ballot.id')
			.on('score.tag', 'in', ['rank', 'winloss', 'point', 'refute', 'po'])
	)
	.select([
		'entry.id',
		'entry.code',
		'round.id as roundId',
		'round.type as roundType',
		'round.name as roundName',
		'panel.bye as panelBye',
		'ballot.bye',
		'ballot.forfeit',
		'ballot.chair',
		'score.id as scoreId',
		'score.tag as scoreTag',
		'score.value as scoreValue',
	])
	.where('sample.id', '=', roundId)
	.whereRef('sample.name', '>=', 'round.name')
	.where((eb) =>
		eb.not(
			eb.exists(
				eb
					.selectFrom('round_setting as rs')
					.select('rs.id')
					.where('rs.tag', '=', 'ignore_results')
					.whereRef('rs.round', '=', 'round.id')
			)
		)
	)
	.execute();
	return resultsData;

};

export default {
	entriesInOrder,
};