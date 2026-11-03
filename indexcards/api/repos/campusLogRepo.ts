import type { Database } from '../data/database.js';
import type { CampusLog } from '../data/schema.js';
import type { Insertable } from 'kysely';

/** log an online room join or check-in */
async function createCampusLog(db: Database, data: Insertable<CampusLog>) {
	return await db.insertInto('campus_log')
		.values(data)
		.returningAll()
		.executeTakeFirstOrThrow();
}

export default {
	createCampusLog,
};
