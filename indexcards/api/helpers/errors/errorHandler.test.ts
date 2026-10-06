import { sql } from 'kysely';
import { db } from '../../data/database.js';
import { createContext } from '../../../tests/httpMocks.js';
import { errorHandler } from './errorHandler.js';

describe('errorHandler', () => {
	it('returns a 503 problem when a query times out', async () => {
		const err = await sql`SET STATEMENT max_statement_time=0.01 FOR SELECT SLEEP(1)`
		.execute(db)
		.catch((e: unknown) => e);
		const { req, res, next } = createContext({ originalUrl: '/v1/slow' });

		errorHandler(err, req, res, next);

		expect(res).toBeProblemResponse(503);
		expect(res.body).not.toHaveProperty('stack');
	});
});
