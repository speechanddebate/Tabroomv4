import type { Database } from '../data/database.js';

type queryOpts = {
	tourns?: number[];
	/** include fines that were deleted */
	deleted?: boolean;
};

function buildFineQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('fine');

	if (opts.tourns) query = query.where('fine.tourn', 'in', opts.tourns);
	if (!opts.deleted) query = query.where('fine.deleted', '=', 0);

	return query;
}

/**
 * The fines a person may see: their own, those assessed against their judges, and every
 * fine billed to the schools they coach. Pass the judge and school ids the person holds
 */
async function getFines(db: Database, opts: queryOpts & { person: number; judges?: number[]; schools?: number[] }) {
	return await buildFineQuery(db, opts)
		.innerJoin('tourn', 'tourn.id', 'fine.tourn')
		.leftJoin('school', 'fine.school', 'school.id')
		.leftJoin('judge', 'fine.judge', 'judge.id')
		.leftJoin('tourn_setting as currency', (join) => join
			.onRef('currency.tourn', '=', 'tourn.id')
			.on('currency.tag', '=', 'currency')
		)
		.select([
			'fine.id',
			'fine.reason',
			'fine.amount',
			'fine.levied_at as leviedAt',
			'fine.tourn',
			'fine.person',
			'currency.value as currency',
			'fine.school as school',
			'school.name as schoolName',
			'fine.judge as judge',
			'judge.first as judgeFirst',
			'judge.last as judgeLast',
		])
		.where((eb) => eb.or([
			eb('fine.person', '=', opts.person),
			eb('fine.judge', 'in', opts.judges ?? []),
			eb('fine.school', 'in', opts.schools ?? []),
		]))
		.execute();
}

export default {
	getFines,
};
