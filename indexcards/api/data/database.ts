import type { DB } from './schema.js'
import { createPool } from 'mariadb'
import { Kysely, SafeNullComparisonPlugin } from 'kysely'
import { MariadbDialect } from "kysely-mariadb";
import config from '../config.js'
import logger, { getCallerFrame } from '../helpers/logger.js'

const dialect = new MariadbDialect({
  mariadb: createPool({
    database: config.db.database,
    host: config.db.host,
    user: config.db.user,
    password: config.db.pass,
    port: config.db.port,
	timezone: 'Z',
	...config.db.pool,
	bigIntAsNumber: true,
	// TINYINT(1) columns come back as numbers. Several of them hold values
	// other than 0/1 (ballot.side, entry.unconfirmed, panel.publish), so
	// casting them to booleans loses data.
  })
})

export const db = new Kysely<DB>({
	dialect,
	plugins: [
		new SafeNullComparisonPlugin(),
	],
	log(event){
		if (event.level === 'error'){
			const error = event.error as { code?: string; sqlMessage?: string | null; message?: string };
			const details = {
				code: error.code,
				error: error.sqlMessage ?? error.message,
				sql: event.query.sql,
				durationMs: event.queryDurationMillis,
				caller: getCallerFrame({ skipContains: ['/api/data/database.'] }),
			};

			if (error.code === 'ER_STATEMENT_TIMEOUT') {
				logger.warn('Query timed out', details);
			} else {
				logger.error('DB error', details);
			}
			return;
		}

		if(event.queryDurationMillis >= config.logging.slowQueryLimit){
			logger.warn('Slow SQL query', {
				durationMs: event.queryDurationMillis,
				caller: getCallerFrame({ skipContains: ['/api/data/database.'] }),
			});
		} else if (logger.isDebugEnabled()) {
			//need to check if debug to avoid building caller frame on every query
			logger.debug('SQL query', {
				sql: event.query.sql,
				durationMs: event.queryDurationMillis,
				caller: getCallerFrame({ skipContains: ['/api/data/database.'] }),
			});
		}
	},
})

export type Database = Kysely<DB>;
export type DBSchema = DB;
