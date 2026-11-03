import type { Database } from '../data/database.js';

type queryOpts = {
	judges?: number[];
	/**
	 * only the strikes a judge may see: conflicts they or their registrant recorded, and
	 * their departure and unavailable times. Tab-entered strikes without the conflict flag,
	 * and school or entry conflicts a registrant did not enter, stay hidden
	 */
	judgeVisible?: boolean;
};

function buildStrikeQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('strike');

	if (opts.judges) query = query.where('strike.judge', 'in', opts.judges);
	if (opts.judgeVisible) {
		query = query.where((eb) => eb.or([
			eb.and([
				eb('strike.conflict', '=', 1),
				eb.or([
					eb('strike.type', 'not in', ['entry', 'school']),
					eb('strike.registrant', '=', 1),
				]),
			]),
			eb('strike.type', 'in', ['departure', 'time']),
		]));
	}

	return query;
}

async function getStrikes(db: Database, opts: queryOpts = {}) {
	return await buildStrikeQuery(db, opts)
		.selectAll('strike')
		.execute();
}

/** The strikes these judges may see, with the school name or entry code each is against */
async function getJudgeStrikes(db: Database, opts: queryOpts & { judges: number[] }) {
	return await buildStrikeQuery(db, { ...opts, judgeVisible: true })
		.leftJoin('school', 'school.id', 'strike.school')
		.leftJoin('entry', 'entry.id', 'strike.entry')
		.select([
			'strike.id',
			'strike.type',
			'strike.start',
			'strike.end',
			'strike.judge',
			'strike.school',
			'school.name as schoolName',
			'strike.entry',
			'entry.code as entryCode',
		])
		.execute();
}

export default {
	getStrikes,
	getJudgeStrikes,
};
