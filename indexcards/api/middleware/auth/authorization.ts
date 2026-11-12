import * as access from './access.js';
import { BadRequest, Unauthorized, Forbidden } from '../../helpers/problem.js';
import { isPositiveId } from '../validation.js';
import type { Request, Response, NextFunction } from 'express';
import type { Actor, AuthError, ResourceId, SessionPerson } from './types.js';
import type { Database } from '../../data/database.js';

/** middleware that rejects anonymous requests. the OpenAPI spec marks routes behind one of these as requiring auth */
export const authMiddleware = new WeakSet<Function>();
/**
 * the person making the request. throws a 401 (handled by errorHandler) when there is none,
 * so handlers can use the result without null checks
 */
export function getPerson(req: Pick<Request, 'person'>): SessionPerson {
	if (!req.person) {
		const err = new Error('User not Authenticated') as AuthError;
		err.status = 401;
		err.code = 'AUTH_UNAUTHENTICATED';
		throw err;
	}
	return req.person;
}

//requires a logged in person - use before any route that acts as or on behalf of a person
export function requirePerson(req: Request, res: Response, next: NextFunction) {
	if (!req.person || req.actor?.type !== 'person') {
		return Unauthorized(req, res,'User not Authenticated');
	}
	next();
}
authMiddleware.add(requirePerson);

export function requireSiteAdmin(req: Request, res: Response, next: NextFunction) {
	// a request that isn't logged in carries an anonymous actor, so the answer is "log in", not "forbidden"
	if (!req.actor || req.actor.type === 'anonymous') {
		return Unauthorized(req, res,'User not Authenticated');
	}
	if (!req.actor.Person?.site_admin){
		return Forbidden(req, res,'This Resource is Restricted to Site Administrators');
	}
	next();
}
authMiddleware.add(requireSiteAdmin);

/**
 * route middleware: 403 unless the actor can perform action on resource.
 * the resource id comes from the :<resource>Id path param, or from resolveId for
 * resources identified some other way (e.g. a ballot by its judge and panel)
 */
export function requireAccess(resource: string, action: string, resolveId?: (req: Request) => ResourceId) {
	// routes are built at startup, so a typo or a missing policy rule fails on boot, not on a request
	if (!access.rule(resource, action)) throw new Error(`requireAccess: no policy for ${action} on ${resource}`);

	const middleware = async (req: Request, res: Response, next: NextFunction) => {
		// anonymous actors can't be granted anything, so the answer is "log in", not "forbidden"
		if (!req.actor || req.actor.type === 'anonymous') {
			return Unauthorized(req, res,'User not Authenticated');
		}
		const resourceId = resolveId ? resolveId(req) : Number(req.params[resource + 'Id']);
		// a composite id (a ballot's { judgeId, panelId }) checks each part, since it runs before ValidateRequest
		const parts = typeof resourceId === 'number' ? { [`${resource}Id`]: resourceId } : resourceId;
		const malformed = Object.keys(parts).find(part => !isPositiveId(parts[part]));
		if (malformed) return BadRequest(req, res, `${malformed} must be a positive integer`);
		try{
			await req.actor.assert(resource, action, resourceId);
			next();
		}
		catch(err: unknown){
			if (err instanceof Error && (err as AuthError).code === 'AUTH_FORBIDDEN'){
				return Forbidden(req, res,`You do not have permission to ${action} on ${resource}: ${formatResourceId(resourceId)}`);
			}
			return next(err);
		}
	};
	authMiddleware.add(middleware);
	return middleware;
}

function formatResourceId(resourceId: ResourceId) {
	if (typeof resourceId === 'number') return String(resourceId);
	return Object.entries(resourceId).map(([key, id]) => `${key} ${id}`).join(', ');
}

/**
 * create an actor for the given person, or an anonymous actor if there is none. Decisions come from
 * the policy engine (access.ts) and are cached for the actor's life, which is one request
 */
export function createActor(db: Database, person?: SessionPerson | null): Actor {
	if (!person) {
		return {
			type: 'anonymous',
			can: async () => false,
			assert: async () => {
				throw forbidden();
			},
			which: async () => ({ all: false, ids: [] }),
		};
	}

	const decisions = new Map<string, Promise<boolean>>();
	async function can(resource: string, action: string, resourceId: ResourceId) {
		// JS callers pass path params straight through, e.g. '12'
		const id = typeof resourceId === 'string' ? Number(resourceId) : resourceId;
		const key = `${resource}:${action}:${JSON.stringify(id)}`;
		if (!decisions.has(key)) decisions.set(key, access.can(db, person!, resource, action, id));
		return decisions.get(key)!;
	}

	return {
		type: 'person',
		id: person.id,
		Person: person,
		can,
		assert: async (resource, action, resourceId) => {
			if (!await can(resource, action, resourceId)) throw forbidden();
		},
		which: (resource, action, bound) => access.which(db, person, resource, action, bound),
	};
}

/** the error assert throws, which errorHandler turns into a 403 */
function forbidden() {
	const err = new Error('Forbidden') as AuthError;
	err.status = 403;
	err.code = 'AUTH_FORBIDDEN';
	return err;
}
