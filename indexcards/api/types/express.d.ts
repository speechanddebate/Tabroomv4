import type { ZodOpenApiOperationObject, ZodOpenApiPathItemObject } from 'zod-openapi';
import type { Tourn } from '../data/schema.js';
import type { Selectable } from 'kysely';
import type { Actor, SessionPerson } from '../middleware/auth/types.js';
import type { Database } from '../data/database.js';

export type RouteOpenApiConfig = (ZodOpenApiPathItemObject | ZodOpenApiOperationObject) & {
	path: string;
};

declare module 'express-serve-static-core' {
	interface IRoute<Route extends string = string> {
		openapi?: RouteOpenApiConfig;
	}
	interface Request {
		db: Database;
		actor: Actor;
		authType?: 'cookie';
		session?: {
			id: number | null;
			person: number;
			su: number | null;
			Person?: SessionPerson;
			Su: SessionPerson | null;
		};
		//deprecated, use req.actor
		person?: unknown;
		tourn?: Selectable<Tourn>;
	}
}
