// Loaded by SvelteKit before the app (kit.experimental.instrumentation.server) so the auto-instrumentations
// can patch modules before the app loads them. Configured with the standard OTEL_* environment variables
// rather than $app/env, which isn't set up yet when this runs. Nothing starts unless a metrics endpoint is set
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { envDetector, hostDetector, processDetector, resourceFromAttributes } from '@opentelemetry/resources';
import packageData from '../package.json' with { type: 'json' };

const metricsEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;

if (metricsEndpoint) {
	const sdk = new NodeSDK({
		// Where the app runs (host.name, container.name, service.instance.id) comes from the deployment through
		// OTEL_RESOURCE_ATTRIBUTES, so docker and kubernetes can each fill it in without code changes
		resource: resourceFromAttributes({
			'service.name': 'schemats',
			'service.version': packageData.version,
			'deployment.environment.name': process.env.NODE_ENV ?? 'development',
		}),
		// env last so OTEL_RESOURCE_ATTRIBUTES wins over the host detector, which reports the container id as host.name
		resourceDetectors: [processDetector, hostDetector, envDetector],
		// No traces yet. An explicit empty list stops the SDK defaulting to an OTLP trace exporter on localhost
		spanProcessors: [],
		metricReaders: [new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({ url: metricsEndpoint }),
			exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60000),
		})],
		instrumentations: [getNodeAutoInstrumentations({
			// a span for every file read is noise
			'@opentelemetry/instrumentation-fs': { enabled: false },
		})],
	});

	sdk.start();

	// adapter-node emits this once the server has closed after SIGTERM/SIGINT. Flush the last metrics
	process.once('sveltekit:shutdown', () => {
		void sdk.shutdown();
	});
}
