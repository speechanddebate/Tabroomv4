import { metrics, type Histogram } from '@opentelemetry/api';

let requestDuration: Histogram | undefined;

// Created on first use, after instrumentation.server.ts has registered the meter provider. A no-op when telemetry is off
function getRequestDuration(): Histogram {
	requestDuration ??= metrics.getMeter('schemats').createHistogram('sveltekit.request.duration', {
		description: 'Duration of requests handled by SvelteKit, by route',
		unit: 's',
		// the OpenTelemetry HTTP buckets, the SDK default is for milliseconds
		advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10] },
	});
	return requestDuration;
}

/** Record how long SvelteKit took to handle a request. route is the route id (e.g. /invite/[tourn]), never the path */
export function recordRequestDuration(durationMs: number, attributes: { route: string | null; method: string; status: number }) {
	getRequestDuration().record(durationMs / 1000, {
		'http.route': attributes.route ?? 'unmatched',
		'http.request.method': attributes.method,
		'http.response.status_code': attributes.status,
	});
}
