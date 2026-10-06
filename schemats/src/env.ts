import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import z from 'zod';

export const variables = defineEnvVars({
	WEB_URL: {
		public: true,
		schema: building ? z.string().optional() : z.string(),
		description: 'The public host of the web application (optional during build, required at runtime)',
	},
	CLASSIC_URL: {
		public: true,
		schema: z.url().default('https://tabroom.com'),
		description: 'The URL for the classic version of Tabroom default: https://tabroom.com',
	},
	//INDEXCARDS
	INDEXCARDS_HOST: {
		public: true,
		schema: building ? z.string().optional() : z.string(),
		description: 'The host URL for the IndexCards service (optional during build, required at runtime)',
	},
	INDEXCARDS_BASE_PATH: {
		public: true,
		schema: z.string().default('/v1'),
		description: 'The base path for the Indexcards service default: /v1',
	},
	AUTH_COOKIE: {
		schema: z.string().default('TabroomToken'),
		description: 'The name of the authentication cookie. default: TabroomToken',
	},
	COOKIE_DOMAIN: {
		public: true,
		schema: z.string().default('.tabroom.com'),
		description: 'The domain for cookies set by schemats. Must cover the indexcards host (match indexcards cookie.domain) or indexcards will not receive them. default: .tabroom.com',
	},
	BROWSER_ID_COOKIE_NAME: {
		public: true,
		schema: z.string().default('Browser_Id'),
		description: 'The name of the browser id cookie and localStorage key. default: Browser_Id',
	},
	// LOGGING
	LOG_LEVEL: {
		schema: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
		description: 'The log level for the application default:info',
	},
	LOGGING_PATH: {
		schema: z.string().optional(),
		description: 'The path for log files. If not set, logging to files is disabled. default: undefined',
	},
	LOGGING_FILE_MAXSIZE: {
		schema: z.string().optional().default('2097152').transform(Number),
		description: 'The maximum size of log files in bytes. default: 2097152',
	},
	LOGGING_FILE_MAXFILES: {
		schema: z.string().optional().default('5').transform(Number),
		description: 'The maximum number of log files to keep. default: 5',
	},
});