import { selectSettings } from './utils/index.js';
import type { Database } from '../data/database.js';

type queryOpts = {
	ids?: number[];
	category?: number;
	/** pools any of these judges are in */
	judges?: number[];
	settings?: boolean | string[];
};

function buildJpoolQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('jpool')
	.$if(opts.settings !== undefined && opts.settings !== false, (qb) => qb.select(selectSettings({
		table: 'jpool',
		settings: opts.settings ?? false,
	})));

	if (opts.ids) query = query.where('jpool.id', 'in', opts.ids);
	if (opts.category) query = query.where('jpool.category', '=', opts.category);
	// the empty list goes in directly: the empty IN plugin rewrites it there, not inside a subquery
	if (opts.judges) query = query.where('jpool.id', 'in', opts.judges.length ? (eb) => eb
		.selectFrom('jpool_judge')
		.select('jpool_judge.jpool')
		.where('jpool_judge.judge', 'in', opts.judges!)
	: []);

	return query;
}

async function getJpool(db: Database, id: number, opts: queryOpts = {}) {
	return await buildJpoolQuery(db, opts)
		.selectAll('jpool')
		.where('jpool.id', '=', id)
		.executeTakeFirst();
}

async function getJpools(db: Database, opts: queryOpts = {}) {
	return await buildJpoolQuery(db, opts)
		.selectAll('jpool')
		.execute();
}

/** The pools these judges are in, one row per pool and judge, with the pool's site and its standby timeslot */
async function getJudgePools(db: Database, opts: queryOpts & { judges: number[] }) {
	return await buildJpoolQuery(db, opts)
		.innerJoin('jpool_judge', (join) => join
			.onRef('jpool_judge.jpool', '=', 'jpool.id')
			.on('jpool_judge.judge', 'in', opts.judges)
		)
		.leftJoin('site', 'site.id', 'jpool.site')
		.leftJoin('jpool_setting as standby_timeslot', (join) => join
			.onRef('standby_timeslot.jpool', '=', 'jpool.id')
			.on('standby_timeslot.tag', '=', 'standby_timeslot')
		)
		.leftJoin('timeslot', 'timeslot.id', 'standby_timeslot.value')
		.select([
			'jpool.id',
			'jpool.name',
			'jpool.site',
			'jpool.category',
			'jpool_judge.judge',
			'site.name as siteName',
			'timeslot.name as standbyName',
			'timeslot.start as standbyStart',
			'timeslot.end as standbyEnd',
		])
		.execute();
}

export default {
	getJpool,
	getJpools,
	getJudgePools,
};
