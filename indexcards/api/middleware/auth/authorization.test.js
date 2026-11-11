
import * as buildTargetModule from './buildTarget.js';
import { requireSiteAdmin, requirePerson, requireAccess, checkAccess, createActor } from './authorization.js';
import { createContext } from '../../../tests/httpMocks.js';
import { db } from '../../data/database.js';

describe('Authorization Middleware', () => {
	describe('requirePerson', () => {
		it('denies anonymous requests', () => {
			const {req, res, next} = createContext();
			req.actor = createActor(req.db, null);

			requirePerson(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(next).not.toHaveBeenCalled();
		});
		it('allows a person', () => {
			const person = { id: 1, site_admin: 0 };
			const {req, res, next} = createContext({ person });
			req.actor = createActor(req.db, person);

			requirePerson(req, res, next);

			expect(next).toHaveBeenCalled();
		});
	});
	describe('requireSiteAdmin', () => {
		it('deny when unauthenticated', () => {
			const {req, res, next} = createContext();

			requireSiteAdmin(req,res,next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(next).not.toHaveBeenCalled();
		});
		it('answers 401 to the anonymous actor a logged-out request carries', () => {
			const {req, res, next} = createContext();
			req.actor = createActor(req.db, null);

			requireSiteAdmin(req,res,next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.status).not.toHaveBeenCalledWith(403);
			expect(next).not.toHaveBeenCalled();
		});
		it('deny when not site_admin', () => {
			const {req, res, next} = createContext({
				person: { id: 1, site_admin: false },
			});
			req.actor = createActor(req.db, req.person);

			requireSiteAdmin(req,res,next);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(next).not.toHaveBeenCalled();
		});
		it('allow when site_admin', () => {
			const {req, res, next} = createContext({
				person: { id: 1, site_admin: true },
			});
			req.actor = createActor(req.db, req.person);
			requireSiteAdmin(req,res,next);

			expect(next).toHaveBeenCalled();
		});

	});

	describe('requireAccess', () => {

		beforeEach(() => {
			vi.restoreAllMocks();
		});

		const resources = ['tourn','category','event','jpool','judge','round','rpool','entry','site','room'];
		const capabilities = ['read','write','owner'];

		const cases = resources.flatMap(resource =>
			capabilities.map(cap => [resource, cap])
		);

		it.each(cases)('denies access for %s:%s when not authenticated',async (resource, capability) => {
			vi.spyOn(buildTargetModule, 'buildTarget').mockResolvedValueOnce({ id: 42, resource, circuitIds: []});
			const { req, res, next } = createContext({
				params: { [`${resource}Id`]: 42 },
			});

			await requireAccess(resource, capability)(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(next).not.toHaveBeenCalled();
		});

		it.each(cases)('allows site_admin to bypass checks for %s:%s',async (resource, capability) => {
			vi.spyOn(buildTargetModule, 'buildTarget').mockResolvedValueOnce({ id: 42, resource, circuitIds: []});
			const {req,res,next} = createContext({
				person: { id: 1, site_admin: true },
				params: { tournId: 1 },
			});
			req.actor = createActor(req.db, req.person);
			await requireAccess(resource, capability)(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it.each(cases)('Allows owner all capabilities for %s',async (resource) => {
			vi.spyOn(buildTargetModule, 'buildTarget').mockResolvedValueOnce({ id: 42, resource, circuitIds: []});
			const {req,res,next} = createContext({
				person: { id: 1, site_admin: false },
				params: { [`${resource}Id`]: 42 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: resource, id: 42, role: 'owner' }]);

			for (const capability of capabilities) {
				await requireAccess(resource, capability)(req, res, next);
				expect(next).toHaveBeenCalled();
				next.mockClear();
			}
		});

		it('allows access with correct permission and capability', async () => {
			const {req,res,next} = createContext({
				person: { id: 1, site_admin: false },
				params: { tournId: 42 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: 'tourn', id: 42, role: 'owner' }]);
			await requireAccess('tourn', 'read')(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it('denies access if permission does not match resource id', async () => {
			let {req, res, next} = createContext({
				person: { id: 1, site_admin: false },
				params: { tournId: 42 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: 'tourn', id: 99, role: 'owner' }]);
			await requireAccess('tourn', 'read')(req, res, next);
			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(403);
		});

		it('allows access if parent scope grants capability', async () => {
			vi.spyOn(buildTargetModule, 'buildTarget').mockResolvedValueOnce({ id: 7, resource: 'category', tournId: 42, circuitIds: []});
			const {req, res, next} = createContext({
				person: { id: 1, site_admin: false },
				params: { tournId: 42, categoryId: 7 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: 'tourn', id: 42, role: 'owner' }]);
			await requireAccess('category', 'read')(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it('denies access if role does not grant capability', async () => {
			let {req, res, next} = createContext({
				person: { id: 1, site_admin: false },
				params: { tournId: 42 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: 'tourn', id: 42, role: 'tabber' }]);
			await requireAccess('tourn', 'owner')(req, res, next);
			expect(next).not.toHaveBeenCalled();
			expect(res.json).toHaveBeenCalled();
		});

		it('allows access for child resource with parent permission', async () => {
			let {req, res, next} = createContext({
				person: { id: 1, site_admin: false },
				params: { tournId: 42, categoryId: 7 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: 'tourn', id: 42, role: 'owner' }]);
			vi.spyOn(buildTargetModule, 'buildTarget').mockResolvedValueOnce({ id: 42, resource: 'category', tournId: 42});

			await requireAccess('category', 'write')(req, res, next);
			expect(next).toHaveBeenCalled();
		});

		it('denies access if no matching permission', async () => {
			const {req, res, next} = createContext({
				person: { id: 1, site_admin: false },
				params: { tournId: 42 },
			});
			req.actor = createActor(req.db, req.person);
			req.actor.grant([{ scope: 'event', id: 99, role: 'owner' }]);
			await requireAccess('tourn', 'read')(req, res, next);
			expect(next).not.toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(403);
		});
	});
	describe('actor.grant', () => {
		it('re-evaluates cached decisions after new perms are granted', async () => {
			const actor = createActor(db, { id: 1, site_admin: 0 });
			expect(await actor.can('tourn', 'read', 42)).toBe(false);
			actor.grant([{ scope: 'tourn', id: 42, role: 'owner' }]);
			expect(await actor.can('tourn', 'read', 42)).toBe(true);
		});
		it('anonymous actors ignore grants', async () => {
			const actor = createActor(db, null);
			actor.grant([{ scope: 'tourn', id: 42, role: 'owner' }]);
			expect(await actor.can('tourn', 'read', 42)).toBe(false);
		});
	});
	describe('checkAccess', () => {
		it('allows tourn owner tourn access', async () => {
			const perm = { scope: 'tourn', id: 42, role: 'owner' };
			const granted = checkAccess('tourn', 'read', {id: 42}, [perm]);
			expect(granted).toBe(true);
		});
		it('allows tourn owner event access', async () => {
			const perm = { scope: 'tourn', id: 42, role: 'owner' };
			const granted = checkAccess('event', 'read', {id: 12, tournId: 42}, [perm]);
			expect(granted).toBe(true);
		});
		it('denies event access when owner of other tourn', async () => {
			const perm = { scope: 'tourn', id: 42, role: 'owner' };
			const granted = checkAccess('event', 'read', {id: 12, tournId: 43}, [perm]);
			expect(granted).toBe(false);
		});
		it('allows access when one perm allows access', async () => {
			const perms = [
				{ scope: 'tourn', id: 42, role: 'owner' },
				{ scope: 'event', id: 12, role: 'owner' },
			];
			const granted = checkAccess('event', 'write', {id: 12, tournId: 44}, perms);
			expect(granted).toBe(true);
		});
		it('denies access when perm with the same id but different scope', async () => {
			const perm = { scope: 'event', id: 12, role: 'owner' };
			const granted = checkAccess('tourn', 'read', {id: 12}, [perm]);
			expect(granted).toBe(false);
		});
		it('allows tourn owner access to category in tourn', async () => {
			const perm = { scope: 'tourn', id: 42, role: 'owner' };
			const granted = checkAccess('category', 'write', {id: 7, tournId: 42}, [perm]);
			expect(granted).toBe(true);
		});
		it('allow event tabber access to timeslot:read', async () => {
			const perm = { scope: 'event', id: 12,tournId: 42, role: 'tabber' };
			const granted = checkAccess('timeslot', 'read', {id: 5, eventId: 12, tournId: 42}, [perm]);
			expect(granted).toBe(true);
		});
	});
	describe('checker', () => {
		// a panel in event 12 (category 7) of tourn 42
		const panel = { id: 99, roundId: 50, eventId: 12, categoryId: 7, tournId: 42 };

		it.each([
			['tourn', 42],
			['event', 12],
			['category', 7],
		])('allows a %s checker to check a panel under it', (scope, id) => {
			const perm = { scope, id, role: 'checker' };
			expect(checkAccess('panel', 'check', panel, [perm])).toBe(true);
		});
		it('denies a checker of another category', () => {
			const perm = { scope: 'category', id: 8, role: 'checker' };
			expect(checkAccess('panel', 'check', panel, [perm])).toBe(false);
		});
		it('denies a checker read and write', () => {
			const perm = { scope: 'tourn', id: 42, role: 'checker' };
			expect(checkAccess('panel', 'read', panel, [perm])).toBe(false);
			expect(checkAccess('panel', 'write', panel, [perm])).toBe(false);
		});
		it.each(['owner', 'tabber'])('allows a tourn %s to check', (role) => {
			const perm = { scope: 'tourn', id: 42, role };
			expect(checkAccess('panel', 'check', panel, [perm])).toBe(true);
		});
		it('denies a category tabber the events in that category', () => {
			const perm = { scope: 'category', id: 7, role: 'tabber' };
			expect(checkAccess('panel', 'check', panel, [perm])).toBe(false);
		});
	});
	describe('schools and entries', () => {
		// two entries in event 12 (category 7) of tourn 42 that meet on a panel, from chapters 100 and 101
		const school = { id: 200, chapterId: 100, tournId: 42 };
		const entry = { id: 300, schoolId: 200, chapterId: 100, eventId: 12, categoryId: 7, tournId: 42 };
		const opponent = { id: 301, schoolId: 201, chapterId: 101, eventId: 12, categoryId: 7, tournId: 42 };

		describe('self', () => {
			const perm = { scope: 'entry', id: 300, role: 'self', tournId: 42 };
			it.each(['read', 'flip'])('allows entry/%s on its own entry', (action) => {
				expect(checkAccess('entry', action, entry, [perm])).toBe(true);
			});
			it.each(['read', 'flip'])('denies entry/%s on the opponent entry', (action) => {
				expect(checkAccess('entry', action, opponent, [perm])).toBe(false);
			});
			it('denies entry/write on its own entry', () => {
				expect(checkAccess('entry', 'write', entry, [perm])).toBe(false);
			});
			it('denies the school', () => {
				expect(checkAccess('school', 'read', school, [perm])).toBe(false);
			});
		});

		describe('chapterAdmin', () => {
			const perm = { scope: 'chapter', id: 100, role: 'chapterAdmin' };
			it("allows school/read on its chapter's school", () => {
				expect(checkAccess('school', 'read', school, [perm])).toBe(true);
			});
			it("allows entry/flip on its chapter's entry, two levels down", () => {
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(true);
			});
			it("denies another chapter's school and the opponent's entry", () => {
				expect(checkAccess('school', 'read', { ...school, id: 201, chapterId: 101 }, [perm])).toBe(false);
				expect(checkAccess('entry', 'flip', opponent, [perm])).toBe(false);
			});
			it('still denies chapter/owner', () => {
				expect(checkAccess('chapter', 'owner', { id: 100 }, [perm])).toBe(false);
			});
		});

		describe('tabbers', () => {
			it.each(['owner', 'tabber', 'circuit'])('allows a tourn %s entry/flip and school/read', (role) => {
				const perm = { scope: 'tourn', id: 42, role };
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(true);
				expect(checkAccess('school', 'read', school, [perm])).toBe(true);
			});
			it.each(['owner', 'tabber', 'circuit'])('denies a %s at another tourn', (role) => {
				const perm = { scope: 'tourn', id: 43, role };
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(false);
				expect(checkAccess('school', 'read', school, [perm])).toBe(false);
			});
			it('allows an event tabber the entries in their event', () => {
				const perm = { scope: 'event', id: 12, tournId: 42, role: 'tabber' };
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(true);
			});
			it("denies an event tabber another event's entries", () => {
				const perm = { scope: 'event', id: 13, tournId: 42, role: 'tabber' };
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(false);
			});
			it('denies a checker entry/flip', () => {
				const perm = { scope: 'tourn', id: 42, role: 'checker' };
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(false);
			});
		});

		describe('prefs', () => {
			const perm = { scope: 'chapter', id: 100, role: 'prefs' };
			it('allows chapter/prefs', () => {
				expect(checkAccess('chapter', 'prefs', { id: 100 }, [perm])).toBe(true);
			});
			it("denies its own chapter's school and entries", () => {
				expect(checkAccess('school', 'read', school, [perm])).toBe(false);
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(false);
			});
		});

		describe('existing grants unchanged', () => {
			it('a judge self still has ballot/* and not entries', () => {
				const perm = { scope: 'judge', id: 9, role: 'self', categoryId: 7, tournId: 42 };
				expect(checkAccess('ballot', 'write', { judgeId: 9, panelId: 99, categoryId: 7, tournId: 42 }, [perm])).toBe(true);
				expect(checkAccess('entry', 'flip', entry, [perm])).toBe(false);
			});
			it('a judge self has judge/conflicts on its own judge only', () => {
				const perm = { scope: 'judge', id: 9, role: 'self', categoryId: 7, tournId: 42 };
				expect(checkAccess('judge', 'conflicts', { id: 9, categoryId: 7, tournId: 42 }, [perm])).toBe(true);
				expect(checkAccess('judge', 'conflicts', { id: 10, categoryId: 7, tournId: 42 }, [perm])).toBe(false);
				expect(checkAccess('judge', 'write', { id: 9, categoryId: 7, tournId: 42 }, [perm])).toBe(false);
			});
			it('a tourn tabber still reaches panels', () => {
				const perm = { scope: 'tourn', id: 42, role: 'tabber' };
				expect(checkAccess('panel', 'write', { id: 99, roundId: 50, eventId: 12, categoryId: 7, tournId: 42 }, [perm])).toBe(true);
			});
		});
	});
});