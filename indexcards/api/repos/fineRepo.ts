import type { Database } from '../data/database.js';

type queryOpts = {
	tourns?: number[];
	/** include fines that were deleted */
	deleted?: boolean;
	/**
	 * only fines assessed against a judge (no-show and bond revocations). Classic sets fine.judge
	 * nowhere else; the rest of the table is school fees and payments
	 */
	judgeFines?: boolean;
	/**
	 * who may see the fine. Unlike the other repos these three are ORed, not ANDed: a fine is
	 * visible when it names the person, one of their judges, or one of the schools they coach
	 */
	person?: number;
	judges?: number[];
	schools?: number[];
};

function buildFineQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('fine');

	if (opts.tourns) query = query.where('fine.tourn', 'in', opts.tourns);
	if (!opts.deleted) query = query.where('fine.deleted', '=', 0);
	if (opts.judgeFines) query = query.where('fine.judge', 'is not', null);
	if (opts.person !== undefined || opts.judges || opts.schools) {
		query = query.where((eb) => eb.or([
			...(opts.person === undefined ? [] : [eb('fine.person', '=', opts.person)]),
			...(opts.judges ? [eb('fine.judge', 'in', opts.judges)] : []),
			...(opts.schools ? [eb('fine.school', 'in', opts.schools)] : []),
		]));
	}

	return query;
}

async function getFines(db: Database, opts: queryOpts = {}) {
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
		.execute();
}

export default {
	getFines,
};
