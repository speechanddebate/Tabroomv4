import type { DB } from './schema.js'
import { createPool } from 'mariadb'
import { HandleEmptyInListsPlugin, Kysely, replaceWithNoncontingentExpression, SafeNullComparisonPlugin, type LogEvent } from 'kysely'
import { MariadbDialect } from "kysely-mariadb";
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api'
import config from '../config.js'
import logger, { getCallerFrame } from '../helpers/logger.js'

// The mariadb driver has no OpenTelemetry instrumentation, so spans are recorded from kysely's query log.
// A no-op tracer when telemetry is disabled
const tracer = trace.getTracer('indexcards-db');

// Record a finished query as a span under the request's active span. Runs after the query, so the start
// time is back-dated by its duration. sql is parameterized, so no values end up in the trace
function recordQuerySpan(event: LogEvent) {
	const endTime = Date.now();
	const operation = event.query.sql.trimStart().split(/\s/, 1)[0].toUpperCase();
	const span = tracer.startSpan(operation, {
		kind: SpanKind.CLIENT,
		startTime: endTime - event.queryDurationMillis,
		attributes: {
			'db.system.name': 'mariadb',
			'db.namespace': config.db.database,
			'db.operation.name': operation,
			'db.query.text': event.query.sql,
			'server.address': config.db.host,
			'server.port': config.db.port,
		},
	});

	if (event.level === 'error') {
		const error = event.error as { code?: string; sqlMessage?: string | null; message?: string };
		span.setAttribute('error.type', error.code ?? 'Error');
		span.setStatus({ code: SpanStatusCode.ERROR, message: error.sqlMessage ?? error.message });
	}
	span.end(endTime);
}

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
		new HandleEmptyInListsPlugin({ strategy: replaceWithNoncontingentExpression }),
	],
	log(event){
		recordQuerySpan(event);

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
