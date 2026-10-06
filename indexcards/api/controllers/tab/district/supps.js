import { sql } from 'kysely';
import { db } from '../../../data/database.js';
// Functions governing supplements, especially the Great Divide
// introduce in 2024 Des Moines nats

// Divide schools for supplements
export async function divideSchools(req, res) {
	const numTeams = req.params.numTeams || 2;

	const { rows: allDistricts } = await sql`select district.id, district.name, district.code, count(entry.id) as suppCount from district, school, entry, event_setting supp where school.tourn = ${req.params.tournId} and school.district = district.id and school.id = entry.school and entry.event = supp.event and supp.tag = 'supp' group by district.id order by suppCount DESC`.execute(db);

	let teamCounter = numTeams;

	await sql`delete ss.* from school_setting ss, school where school.tourn = ${req.params.tournId} and school.id = ss.school and ss.tag = 'supp_tag'`.execute(db);

	for await (const district of allDistricts) {
		teamCounter--;
		if (teamCounter < 1) {
			teamCounter = numTeams;
		}

		const team = teamCounter;
		const schools = await db.selectFrom('school')
			.select('id')
			.where('district', '=', district.id)
			.where('tourn', '=', req.params.tournId)
			.execute();

		for await (const school of schools) {
			await db.insertInto('school_setting')
				.values({
					school : school.id,
					tag    : 'supp_site',
					value  : String(team),
				})
				.execute();
		}
	}

	res.status(200).json(allDistricts);
}

export default divideSchools;
