import { sql } from 'kysely';
import { db } from './database.js';
import logger from '../helpers/logger.js';

describe('db query logging', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('logs a failed query without its parameters', async () => {
		const error = vi.spyOn(logger, 'error');

		await db
		.selectFrom('person')
		.select('id')
		.where('email', '=', 'jane.doe@example.com')
		.where(sql.ref('no_such_column'), '=', 'reset-token-abc123')
		.execute()
		.catch(() => {});

		expect(error).toHaveBeenCalledWith('DB error', expect.objectContaining({
			code: 'ER_BAD_FIELD_ERROR',
			error: "Unknown column 'no_such_column' in 'WHERE'",
			sql: 'select `id` from `person` where `email` = ? and `no_such_column` = ?',
		}));
		const logged = JSON.stringify(error.mock.calls);
		expect(logged).not.toContain('jane.doe@example.com');
		expect(logged).not.toContain('reset-token-abc123');
	});

	it('logs a timed out query as a warning', async () => {
		const error = vi.spyOn(logger, 'error');
		const warn = vi.spyOn(logger, 'warn');
		const query = 'SET STATEMENT max_statement_time=0.01 FOR SELECT SLEEP(1)';

		await sql.raw(query).execute(db).catch(() => {});

		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith('Query timed out', expect.objectContaining({
			code: 'ER_STATEMENT_TIMEOUT',
			sql: query,
		}));
		expect(error).not.toHaveBeenCalled();
	});
});
