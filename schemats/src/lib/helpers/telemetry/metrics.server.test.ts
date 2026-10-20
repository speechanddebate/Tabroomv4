import { metrics } from '@opentelemetry/api';
import { AggregationTemporality, InMemoryMetricExporter, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { Histogram } from '@opentelemetry/sdk-metrics';
import { recordRequestDuration } from './metrics.server';

describe('recordRequestDuration', () => {
	const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
	const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60000 });

	beforeAll(() => {
		metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
	});

	afterAll(() => {
		metrics.disable();
	});

	it('records seconds labelled with the route id, method and status', async () => {
		recordRequestDuration(250, { route: '/invite/[tourn]', method: 'GET', status: 200 });
		recordRequestDuration(100, { route: null, method: 'GET', status: 404 });
		await reader.forceFlush();

		const metric = exporter.getMetrics()[0].scopeMetrics[0].metrics[0];
		expect(metric.descriptor).toMatchObject({ name: 'sveltekit.request.duration', unit: 's' });
		expect(metric.dataPoints.map(point => ({ attributes: point.attributes, sum: (point.value as Histogram).sum }))).toEqual([
			{
				attributes: { 'http.route': '/invite/[tourn]', 'http.request.method': 'GET', 'http.response.status_code': 200 },
				sum: 0.25,
			},
			{
				attributes: { 'http.route': 'unmatched', 'http.request.method': 'GET', 'http.response.status_code': 404 },
				sum: 0.1,
			},
		]);
	});
});
