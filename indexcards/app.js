import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';

import config from './api/config.ts';
import errorHandler from './api/helpers/errors/errorHandler.js';
import { Authenticate } from './api/middleware/auth/authentication.ts';
import csrfMiddleware from './api/middleware/csrfMiddleware.ts';
import v1Router, { openApiSpec } from './api/routes/routers/v1/indexRouter.ts';
import { writeOpenApiSpec } from './api/routes/openapi/createOpenApiSpec.ts';
import { rateLimiterMiddleware } from './api/middleware/rateLimiter.ts';
import { db } from './api/data/database.ts';
import { sql } from 'kysely';
import logger, { setupRequest } from './api/helpers/logger.js';
import { startQueues, startWorkers, stopQueues } from './api/services/queue/index.ts';
import { initWebPush } from './api/services/notifications/channels/webpush.ts';
import { closeMail } from './api/services/notifications/channels/email.ts';
import { onShutdown } from './api/helpers/shutdown.ts';

const app = express();

logger.debug('Starting Indexcards using config:', config);
// Startup log message
logger.info('Initializing API...');
logger.info(`Loading environment ${process.env?.NODE_ENV}`);

try {
	await sql`SELECT 1`.execute(db);
	logger.info(`Successfully connected to database ${config.db.database} at ${config.db.host}:${config.db.port}`);
} catch (error) {
	logger.error(`Failed to connect to database ${config.db.database} at ${config.db.host}:${config.db.port}`, error );
}

initWebPush();

if (process.env.NODE_ENV !== 'test') {
	await startQueues();
	startWorkers();
	// Hooks run last registered first, so the relays close after the workers finish their jobs
	onShutdown('mail', async () => closeMail());
	onShutdown('queues', stopQueues);
}

// Enable Helmet security
app.use(helmet({
	contentSecurityPolicy: false, //helmet v3 had this off by default
}));

// Enable CORS Access, hopefully in a way that means I don't
// have to fight with it ever again.
const corsOptions = {
	methods              : ['GET', 'POST', 'DELETE', 'PUT'],
	optionsSuccessStatus : 204,
	credentials          : true,
	origin               : config.cors.origins,
};
app.use(cors(corsOptions));

// Add a unique UUID to every request, and add the configuration for easy
// transport

app.use((req, res, next) => {
	req.db = db;
	req.uuid   = randomUUID();
	req.config = config;
	return next();
});

app.use(setupRequest);

app.get('/v1/ip', (request, response) => response.send(request.ip));

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ type: ['json', 'application/*json'], limit: '10mb' }));
app.use(express.text({ type: '*/*', limit: '10mb' }));

// Parse cookies and add them to the session
app.use(cookieParser());

// Authenticate all requests and set req.actor
app.use(Authenticate);

if (config.proxy) {
	app.set('trust proxy', config.proxy);
}
if(process.env.NODE_ENV === 'production') {
	app.use(rateLimiterMiddleware);
}

app.use(csrfMiddleware);

app.get('/', (req, res) => {
	res.redirect(301, '/v1/reference');
});

app.use('/v1',v1Router);

// Write the spec built at startup to disk so schemats' orval client can generate from it
if (process.env.NODE_ENV === 'development') {
	try {
		const outputPath = await writeOpenApiSpec(openApiSpec);
		logger.info(`Wrote OpenAPI spec to ${outputPath}`);
	} catch (err) {
		logger.warn('Failed to write OpenAPI spec', err);
	}
}

// Final fallback error handling
app.use(errorHandler);

//start server
if (process.env.NODE_ENV !== 'test') {
	app.listen(config.port,config.host, () => {
		logger.info(`Server started. Listening on host ${config.host} on port ${config.port}`);
	});
}

export default app;
