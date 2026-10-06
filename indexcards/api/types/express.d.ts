import type { ZodOpenApiOperationObject, ZodOpenApiPathItemObject } from 'zod-openapi';
import type { Tourn } from '../data/schema.js';
import type { Selectable } from 'kysely';
import type { Actor, Perm, SessionPerson } from '../middleware/auth/types.js';

export type RouteOpenApiConfig = (ZodOpenApiPathItemObject | ZodOpenApiOperationObject) & {
	path: string;
};

declare module 'express-serve-static-core' {
	interface IRoute<Route extends string = string> {
		openapi?: RouteOpenApiConfig;
	}
	interface Request {
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
		auth?: {
			perms: Perm[];
		};
		tourn?: Selectable<Tourn>;
	}
}
