import { sql } from 'kysely';
import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { db } from './database.js';
import logger from '../helpers/logger.js';
import config from '../config.js';

describe('db query logging', () => {
	const slowQueryLimit = config.logging.slowQueryLimit;

	afterEach(() => {
		config.logging.slowQueryLimit = slowQueryLimit;
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

	it('logs a query over the slow query limit as a warning without its sql', async () => {
		config.logging.slowQueryLimit = 20;
		const warn = vi.spyOn(logger, 'warn');
		const debug = vi.spyOn(logger, 'debug');
		vi.spyOn(logger, 'isDebugEnabled').mockReturnValue(true);

		await sql`SELECT SLEEP(0.05), ${'secret-param'} AS p`.execute(db);

		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith('Slow SQL query', {
			durationMs: expect.toSatisfy((ms: number) => ms >= 20),
			caller: expect.any(String),
		});
		expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-param');
		expect(debug).not.toHaveBeenCalled();
	});

	it('does not log a fast query as slow', async () => {
		const warn = vi.spyOn(logger, 'warn');

		await sql`SELECT 1`.execute(db);

		expect(warn).not.toHaveBeenCalled();
	});

	it('logs every query at debug level when debug is enabled', async () => {
		const debug = vi.spyOn(logger, 'debug');
		vi.spyOn(logger, 'isDebugEnabled').mockReturnValue(true);

		await db
		.selectFrom('person')
		.select('id')
		.where('email', '=', 'jane.doe@example.com')
		.execute();

		expect(debug).toHaveBeenCalledOnce();
		expect(debug).toHaveBeenCalledWith('SQL query', {
			sql: 'select `id` from `person` where `email` = ?',
			durationMs: expect.any(Number),
			caller: expect.any(String),
		});
		expect(JSON.stringify(debug.mock.calls)).not.toContain('jane.doe@example.com');
	});

	it('does not log queries at debug level when debug is disabled', async () => {
		const debug = vi.spyOn(logger, 'debug');
		vi.spyOn(logger, 'isDebugEnabled').mockReturnValue(false);

		await sql`SELECT 1`.execute(db);

		expect(debug).not.toHaveBeenCalled();
	});
});

describe('db query spans', () => {
	const exporter = new InMemorySpanExporter();
	const tracer = trace.getTracer('test');

	beforeAll(() => {
		context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
		trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }));
	});

	afterEach(() => {
		exporter.reset();
	});

	afterAll(() => {
		trace.disable();
		context.disable();
	});

	it('records a query as a child span of the active span without its parameters', async () => {
		const request = tracer.startSpan('request');
		await context.with(trace.setSpan(context.active(), request), () => db
			.selectFrom('person')
			.select('id')
			.where('email', '=', 'jane.doe@example.com')
			.execute()
		);
		request.end();

		const [span] = exporter.getFinishedSpans().filter(s => s.name !== 'request');
		expect(span.name).toBe('SELECT');
		expect(span.kind).toBe(SpanKind.CLIENT);
		expect(span.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
		expect(span.attributes).toMatchObject({
			'db.system.name': 'mariadb',
			'db.namespace': config.db.database,
			'db.operation.name': 'SELECT',
			'db.query.text': 'select `id` from `person` where `email` = ?',
		});
		expect(JSON.stringify(span.attributes)).not.toContain('jane.doe@example.com');
	});

	it('records a failed query as an error span', async () => {
		await db
		.selectFrom('person')
		.select(sql.ref('no_such_column').as('x'))
		.execute()
		.catch(() => {});

		const [span] = exporter.getFinishedSpans();
		expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: "Unknown column 'no_such_column' in 'SELECT'" });
		expect(span.attributes['error.type']).toBe('ER_BAD_FIELD_ERROR');
	});
});
