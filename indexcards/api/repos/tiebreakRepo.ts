import type { Database } from '../data/database.js';

type queryOpts = {
	protocol?: number;
	protocols?: number[];
}
function buildTiebreakQuery(db: Database, opts: queryOpts = {}){
	let query  = db.selectFrom('tiebreak');
	if (opts?.protocol) query = query.where('protocol', '=', opts.protocol);
	if (opts?.protocols) query = query.where('protocol', 'in', opts.protocols);
	return query;
}

export const getTiebreak = async (db:Database, id: number, opts: queryOpts = {}) => {
	if (!id) throw new Error('getTiebreak: id is required');
	return await buildTiebreakQuery(db, opts)
	.where('id', '=', id)
	.selectAll('tiebreak')
	.executeTakeFirst();
};

async function getTiebreaks(db: Database, opts: queryOpts = {}) {
	return await buildTiebreakQuery(db, opts)
	.selectAll('tiebreak')
	.execute();
}

export default {
	getTiebreak,
	getTiebreaks,
};
