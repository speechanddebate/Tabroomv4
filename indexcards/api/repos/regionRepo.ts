import type { Database } from '../data/database.js';

type queryOpts = {
	ids?: number[];
	tourn?: number;
};

function buildRegionQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('region');

	if (opts.ids) query = query.where('region.id', 'in', opts.ids);
	if (opts.tourn) query = query.where('region.tourn', '=', opts.tourn);

	return query;
}

async function getRegions(db: Database, opts: queryOpts = {}) {
	return await buildRegionQuery(db, opts)
		.selectAll('region')
		.orderBy('region.name')
		.execute();
}

export default {
	buildRegionQuery,
	getRegions,
};
