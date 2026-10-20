// Loaded with --import before app.js so the auto-instrumentations can patch modules before the app loads them
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { envDetector, hostDetector, processDetector, resourceFromAttributes } from '@opentelemetry/resources';
import packageData from '../package.json' with { type: 'json' };
import config from './config.js';

const { telemetry } = config;

if (telemetry.enabled) {
	const sdk = new NodeSDK({
		// Where the app runs (host.name, container.name, service.instance.id) comes from the deployment through
		// OTEL_RESOURCE_ATTRIBUTES, so docker and kubernetes can each fill it in without code changes
		resource: resourceFromAttributes({
			'service.name': telemetry.serviceName,
			'service.version': packageData.version,
			'deployment.environment.name': telemetry.environment,
		}),
		// env last so OTEL_RESOURCE_ATTRIBUTES wins over the host detector, which reports the container id as host.name
		resourceDetectors: [processDetector, hostDetector, envDetector],
		// Pass an explicit (possibly empty) list, otherwise the SDK falls back to OTEL_* env defaults and exports to localhost
		spanProcessors: telemetry.tracesEndpoint
			? [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: telemetry.tracesEndpoint }) })]
			: [],
		metricReaders: telemetry.metricsEndpoint
			? [new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({ url: telemetry.metricsEndpoint }),
				exportIntervalMillis: telemetry.metricsInterval,
			})]
			: [],
		instrumentations: [getNodeAutoInstrumentations({
			// a span for every file read is noise
			'@opentelemetry/instrumentation-fs': { enabled: false },
		})],
	});

	sdk.start();

	// Flush buffered spans and metrics before the container stops
	process.once('SIGTERM', async () => {
		try {
			await sdk.shutdown();
		} finally {
			process.exit(0);
		}
	});
}
