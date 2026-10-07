import { vi } from 'vitest';
import factories from '../../../tests/factories/index.js';
import { createContext, createPersonContext } from '../../../tests/httpMocks.js';
import { createActor } from './authorization.js';
import {
	loadTournAuthContext,
	loadChapterAuthContext,
	loadJudgeAuthContext,
	loadPanelAuthContext,
} from './authContext.js';

import type { NextFunction, Request, Response } from 'express';
import type { Actor, Perm } from './types.js';

type Adapter = (req: Request, res: Response, next: NextFunction, value: string) => Promise<unknown>;

const adapters: [string, Adapter][] = [
	['loadTournAuthContext', loadTournAuthContext],
	['loadChapterAuthContext', loadChapterAuthContext],
	['loadJudgeAuthContext', loadJudgeAuthContext],
	['loadPanelAuthContext', loadPanelAuthContext],
];

async function personContext() {
	const person = await factories.person.create();
	const con = createPersonContext(person);
	const grant = vi.spyOn(con.req.actor, 'grant');
	return { ...con, person, grant };
}

function anonymousContext() {
	const con = createContext();
	con.req.actor = createActor(con.req.db, null);
	return con;
}

/** the perms passed to actor.grant, flattened across calls */
function granted(grant: { mock: { calls: unknown[][] } }): Perm[] {
	return grant.mock.calls.flatMap(([perms]) => perms as Perm[]);
}

describe('auth context adapters', () => {
	describe.each(adapters)('%s', (_name, adapter) => {
		it.each(['abc', '12abc', '0', '-3', '1.5'])('returns 400 for malformed id %s', async (value) => {
			const { req, res, next, grant } = await personContext();

			await adapter(req, res, next, value);

			expect(res.statusCode).toBe(400);
			expect(next).not.toHaveBeenCalled();
			expect(grant).not.toHaveBeenCalled();
		});

		it('returns 400 for a malformed id from an anonymous caller', async () => {
			const { req, res, next } = anonymousContext();

			await adapter(req, res, next, 'abc');

			expect(res.statusCode).toBe(400);
			expect(next).not.toHaveBeenCalled();
		});

		it('passes anonymous callers through without loading anything', async () => {
			const { req, res, next } = anonymousContext();

			// an id that doesn't exist: anonymous callers must not learn that from a 404
			await adapter(req, res, next, '999999999');

			expect(next).toHaveBeenCalledWith();
			expect(res.status).not.toHaveBeenCalled();
		});

		it('returns 501 for actors that are not persons', async () => {
			const { req, res, next } = createContext();
			const grant = vi.fn();
			req.actor = { type: 'service', grant } as unknown as Actor;

			await adapter(req, res, next, '1');

			expect(res.statusCode).toBe(501);
			expect(next).not.toHaveBeenCalled();
			expect(grant).not.toHaveBeenCalled();
		});
	});

	describe('loadJudgeAuthContext', () => {
		it('returns 404 when the judge does not exist', async () => {
			const { req, res, next, grant } = await personContext();

			await loadJudgeAuthContext(req, res, next, '999999999');

			expect(res.statusCode).toBe(404);
			expect(next).not.toHaveBeenCalled();
			expect(grant).not.toHaveBeenCalled();
		});

		it('grants self on the judge when the caller is the judge', async () => {
			const { req, res, next, person, grant } = await personContext();
			const tourn = await factories.tourn.create();
			const category = await factories.category.create({ tourn: tourn.id });
			const judge = await factories.judge.create({ person: person.id, category: category.id });

			await loadJudgeAuthContext(req, res, next, String(judge.id));

			expect(next).toHaveBeenCalledWith();
			expect(granted(grant)).toContainEqual({
				scope: 'judge',
				id: judge.id,
				role: 'self',
				categoryId: category.id,
				tournId: tourn.id,
			});
		});

		it('does not grant self when the caller is not the judge', async () => {
			const { req, res, next, grant } = await personContext();
			const other = await factories.person.create();
			const category = await factories.category.create({ tourn: (await factories.tourn.create()).id });
			const judge = await factories.judge.create({ person: other.id, category: category.id });

			await loadJudgeAuthContext(req, res, next, String(judge.id));

			expect(next).toHaveBeenCalledWith();
			expect(granted(grant).filter(perm => perm.role === 'self')).toEqual([]);
		});

		it('does not grant self for an unlinked judge', async () => {
			const { req, res, next, grant } = await personContext();
			const judge = await factories.judge.create();

			await loadJudgeAuthContext(req, res, next, String(judge.id));

			expect(next).toHaveBeenCalledWith();
			expect(granted(grant)).toEqual([]);
		});

		it("grants the caller's perms in the judge's tourn", async () => {
			const { req, res, next, person, grant } = await personContext();
			const tourn = await factories.tourn.create();
			const category = await factories.category.create({ tourn: tourn.id });
			const judge = await factories.judge.create({ category: category.id });
			await factories.permission.create({ person: person.id, tourn: tourn.id, tag: 'tabber' });

			await loadJudgeAuthContext(req, res, next, String(judge.id));

			expect(next).toHaveBeenCalledWith();
			expect(granted(grant)).toContainEqual(expect.objectContaining({
				scope: 'tourn',
				id: tourn.id,
				role: 'tabber',
			}));
		});

		it("does not grant perms from another tourn", async () => {
			const { req, res, next, person, grant } = await personContext();
			const category = await factories.category.create({ tourn: (await factories.tourn.create()).id });
			const judge = await factories.judge.create({ category: category.id });
			const otherTourn = await factories.tourn.create();
			await factories.permission.create({ person: person.id, tourn: otherTourn.id, tag: 'owner' });

			await loadJudgeAuthContext(req, res, next, String(judge.id));

			expect(next).toHaveBeenCalledWith();
			expect(granted(grant)).toEqual([]);
		});
	});

	describe('loadPanelAuthContext', () => {
		it('returns 404 when the panel does not exist', async () => {
			const { req, res, next } = await personContext();

			await loadPanelAuthContext(req, res, next, '999999999');

			expect(res.statusCode).toBe(404);
			expect(next).not.toHaveBeenCalled();
		});

		it('passes an existing panel through without granting anything yet', async () => {
			const { req, res, next, grant } = await personContext();
			const panel = await factories.panel.create();

			await loadPanelAuthContext(req, res, next, String(panel.id));

			expect(next).toHaveBeenCalledWith();
			expect(grant).not.toHaveBeenCalled();
		});
	});
});
