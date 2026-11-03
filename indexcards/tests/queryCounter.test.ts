import { sql } from 'kysely';
import { db } from '../api/data/database.js';
import { countQueries } from './queryCounter.js';

describe('countQueries', () => {
	it('counts the queries run inside the callback and returns their sql', async () => {
		const { result, count, queries } = await countQueries(async () => {
			await sql`SELECT 1`.execute(db);
			await db.selectFrom('person').select('id').where('id', '=', 1).execute();
			return 'done';
		});

		expect(result).toBe('done');
		expect(count).toBe(2);
		expect(queries).toEqual(['SELECT 1', 'select `id` from `person` where `id` = ?']);
	});
	it('starts each count from zero', async () => {
		await countQueries(() => sql`SELECT 1`.execute(db));
		const { count } = await countQueries(() => sql`SELECT 2`.execute(db));

		expect(count).toBe(1);
	});
});
