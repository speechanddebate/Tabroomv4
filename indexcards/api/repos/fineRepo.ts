import type { Database } from '../data/database.js';

async function getFines(db: Database, person: number, tourn: number){

	const fines = await db
		.selectFrom('fine')
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
			'currency.value as currency',
			'fine.school as school',
			'school.name as schoolName',
			'fine.judge as judge',
			'judge.first as judgeFirst',
			'judge.last as judgeLast',
		])
		// The person's own fines, and every fine billed to a school whose chapter they coach
		.where((eb) => eb.or([
			eb('fine.person', '=', person),
			eb.exists(
				eb.selectFrom('permission')
					.select('permission.id')
					.where('permission.person', '=', person)
					.whereRef('permission.chapter', '=', 'school.chapter')
					.where('permission.tag', '=', 'chapter')
			),
		]))
		.where('tourn.id', '=', tourn)
		.where('fine.deleted', '=', 0)
		.execute();

	return fines;
}

export default {
	getFines,
};
