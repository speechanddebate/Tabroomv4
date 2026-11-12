import factories from '../../../tests/factories/index.js';
import { createContext, createPersonContext } from '../../../tests/httpMocks.js';
import { db } from '../../data/database.js';
import { createActor, requireAccess, requirePerson, requireSiteAdmin } from './authorization.js';

import type { AuthError } from './types.js';

describe('requirePerson', () => {
	it('returns 401 to an anonymous request', () => {
		const { req, res, next } = createContext();
		req.actor = createActor(db, null);

		requirePerson(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(next).not.toHaveBeenCalled();
	});

	it('passes a person', async () => {
		const { req, res, next } = createPersonContext(await factories.person.create());

		requirePerson(req, res, next);

		expect(next).toHaveBeenCalledWith();
	});
});

describe('requireSiteAdmin', () => {
	it('returns 401, not 403, to the anonymous actor a logged-out request carries', () => {
		const { req, res, next } = createContext();
		req.actor = createActor(db, null);

		requireSiteAdmin(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 403 to a person who is not a site admin', async () => {
		const { req, res, next } = createPersonContext(await factories.person.create());

		requireSiteAdmin(req, res, next);

		expect(res.statusCode).toBe(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('passes a site admin', async () => {
		const { req, res, next } = createPersonContext(await factories.person.create({ site_admin: 1 }));

		requireSiteAdmin(req, res, next);

		expect(next).toHaveBeenCalledWith();
	});
});

describe('requireAccess', () => {
	it('throws when a route is built for a pair the policy has no rule for', () => {
		expect(() => requireAccess('tourn', 'nonsense')).toThrow('no policy for nonsense on tourn');
		expect(() => requireAccess('nonsense', 'read')).toThrow('no policy for read on nonsense');
	});

	it('returns 401 to an anonymous request', async () => {
		const { req, res, next } = createContext({ params: { tournId: '1' } });
		req.actor = createActor(db, null);

		await requireAccess('tourn', 'read')(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(next).not.toHaveBeenCalled();
	});

	it('passes a site admin', async () => {
		const { req, res, next } = createPersonContext(await factories.person.create({ site_admin: 1 }), { params: { tournId: '1' } });

		await requireAccess('tourn', 'owner')(req, res, next);

		expect(next).toHaveBeenCalledWith();
	});

	it.each(['abc', '0', '-3', '1.5'])('returns 400 for a malformed id %s, naming the param', async (value) => {
		const { req, res, next } = createPersonContext(await factories.person.create(), { params: { tournId: value } });

		await requireAccess('tourn', 'read')(req, res, next);

		expect(res.statusCode).toBe(400);
		expect(res.body).toMatchObject({ detail: 'tournId must be a positive integer' });
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 400 for a malformed part of a composite id, before the query', async () => {
		const { req, res, next } = createPersonContext(await factories.person.create(), { params: { judgeId: 'abc', panelId: '1' } });

		await requireAccess('ballot', 'read', req => ({ judgeId: Number(req.params.judgeId), panelId: Number(req.params.panelId) }))(req, res, next);

		expect(res.statusCode).toBe(400);
		expect(res.body).toMatchObject({ detail: 'judgeId must be a positive integer' });
	});

	it('returns 403 to a person with no relation to the resource, naming it', async () => {
		const tourn = await factories.tourn.create();
		const { req, res, next } = createPersonContext(await factories.person.create(), { params: { tournId: String(tourn.id) } });

		await requireAccess('tourn', 'read')(req, res, next);

		expect(res.statusCode).toBe(403);
		expect(res.body).toMatchObject({ detail: `You do not have permission to read on tourn: ${tourn.id}` });
		expect(next).not.toHaveBeenCalled();
	});
});

describe('createActor', () => {
	it('gives an anonymous actor nothing', async () => {
		const actor = createActor(db, null);

		expect(await actor.can('tourn', 'read', 1)).toBe(false);
		expect(await actor.which('event', 'read', { tourn: 1 })).toEqual({ all: false, ids: [] });
		await expect(actor.assert('tourn', 'read', 1)).rejects.toMatchObject({ status: 403, code: 'AUTH_FORBIDDEN' } satisfies Partial<AuthError>);
	});

	it("asserts with the 403 errorHandler expects, and passes once the person's row exists", async () => {
		const tourn = await factories.tourn.create();
		const person = await factories.person.create();

		await expect(createActor(db, person).assert('tourn', 'write', tourn.id)).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });

		await factories.permission.create({ person: person.id, tourn: tourn.id, tag: 'tabber' });
		// a new actor, as each request gets one; an actor caches its answers for its request
		await expect(createActor(db, person).assert('tourn', 'write', tourn.id)).resolves.toBeUndefined();
	});

	it('asks the database once for a check repeated within a request', async () => {
		const tourn = await factories.tourn.create();
		let queries = 0;
		const counted = db.withPlugin({ transformQuery: ({ node }) => { queries++; return node; }, transformResult: async ({ result }) => result });
		const actor = createActor(counted, await factories.person.create());

		await actor.can('tourn', 'read', tourn.id);
		const afterFirst = queries;
		await actor.can('tourn', 'read', tourn.id);

		expect(queries).toBe(afterFirst);
	});

	it('accepts the string ids JS callers pass straight from the path', async () => {
		const tourn = await factories.tourn.create();
		const person = await factories.person.create();
		await factories.permission.create({ person: person.id, tourn: tourn.id, tag: 'owner' });

		expect(await createActor(db, person).can('tourn', 'owner', String(tourn.id) as unknown as number)).toBe(true);
	});
});
