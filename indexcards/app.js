import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuid } from 'uuid';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

import config from './api/config.js';
import errorHandler from './api/helpers/errors/errorHandler.js';
import { Authenticate } from './api/middleware/auth/authentication.js';
import csrfMiddleware from './api/middleware/csrfMiddleware.js';
import v1Router, { openApiSpec } from './api/routes/routers/v1/indexRouter.js';
import { writeOpenApiSpec } from './api/routes/openapi/createOpenApiSpec.js';
import { rateLimiterMiddleware } from './api/middleware/rateLimiter.js';
import { db } from './api/data/database.js';
import { sql } from 'kysely';
import logger, { setupRequest } from './api/helpers/logger.js';

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
	req.uuid   = uuid();
	req.config = config;
	return next();
});

app.use(setupRequest);

app.get('/v1/ip', (request, response) => response.send(request.ip));

// Parse body
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ type: ['json', 'application/*json'], limit: '10mb' }));
app.use(bodyParser.text({ type: '*/*', limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
	// Pretty print JSON in the dev environment
	app.use(bodyParser.json());
	app.set('json spaces', 4);
}

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
