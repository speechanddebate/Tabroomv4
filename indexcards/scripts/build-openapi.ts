#!/usr/bin/env node
import { openApiSpec as spec } from '../api/routes/routers/v1/indexRouter.js';
import { writeOpenApiSpec } from '../api/routes/openapi/createOpenApiSpec.js';
import logger from '../api/helpers/logger.js';

try {
	// Strict validation
	const routeCount = Object.keys(spec.paths ?? {}).length;
	if (routeCount === 0) {
		logger.error('No routes in OpenAPI spec!');
		process.exit(1);
	}

	const outputPath = await writeOpenApiSpec(spec);
	logger.info(`Generated OpenAPI spec with ${routeCount} routes -> ${outputPath}`);
} catch (err) {
	logger.error('Failed to generate OpenAPI spec:', err);
	process.exit(1);
}
process.exit(0);
