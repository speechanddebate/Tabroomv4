import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';

// Counts the SQL queries a piece of code runs, by the spans api/data/database.ts records for
// each one. The tracer provider is global to the process, so a test file that uses this
// must not also install its own.

const exporter = new InMemorySpanExporter();
let installed = false;

function install() {
	if (installed) return;
	context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
	trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }));
	installed = true;
}

/** Runs fn and returns its result with the number of queries it ran and their SQL */
export async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; count: number; queries: string[] }> {
	install();
	exporter.reset();
	const result = await fn();
	const queries = exporter
		.getFinishedSpans()
		.filter((span) => span.instrumentationScope.name === 'indexcards-db')
		.map((span) => String(span.attributes['db.query.text'] ?? ''));
	return { result, count: queries.length, queries };
}
