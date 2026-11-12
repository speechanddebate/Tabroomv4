import factories from '../../tests/factories/index.js';
import { createContext, createPersonContext } from '../../tests/httpMocks.js';
import { createActor } from '../middleware/auth/authorization.js';
import { requireRoundOutToJudges } from './judgePolicy.js';

describe('requireRoundOutToJudges', () => {
	it('returns 404 on a released round to a caller who cannot read that ballot, as for an unreleased one', async () => {
		const judge = await factories.judge.create();
		const otherJudge = await factories.judge.create();
		const round = await factories.round.create({ published: 1 });
		const panel = await factories.panel.create({ round: round.id });
		await factories.ballot.create({ judge: otherJudge.id, panel: panel.id });
		const { req, res, next } = createPersonContext(await factories.person.create(), {
			params: { judgeId: String(judge.id), panelId: String(panel.id) },
		});

		await requireRoundOutToJudges(req, res, next);

		expect(res.statusCode).toBe(404);
		expect(next).not.toHaveBeenCalled();
	});

	describe('before the round is out to judges', () => {
		// The judge's ballot on a round with the given published value and settings. With a role,
		// the person also holds that permission row on the tourn
		const judgeBallot = async (round: { published: number, settings?: Record<string, string> }, role?: 'tabber') => {
			const person = await factories.person.create();
			const tourn = await factories.tourn.create();
			const category = await factories.category.create({ tourn: tourn.id });
			const event = await factories.event.create({ tourn: tourn.id, category: category.id });
			const created = await factories.round.create({ event: event.id, ...round });
			const panel = await factories.panel.create({ round: created.id });
			const judge = await factories.judge.create({ person: person.id, category: category.id });
			await factories.ballot.create({ judge: judge.id, panel: panel.id });

			if (role) await factories.permission.create({ person: person.id, tourn: tourn.id, tag: role });
			return createPersonContext(person, { params: { judgeId: String(judge.id), panelId: String(panel.id) } });
		};

		it('returns 404 to the judge while the round is unpublished, as if there were no ballot', async () => {
			const { req, res, next } = await judgeBallot({ published: 0 });

			await requireRoundOutToJudges(req, res, next);

			expect(res.statusCode).toBe(404);
			expect(res.body).toMatchObject({ detail: expect.stringMatching(/has no ballot on panel/) });
			expect(next).not.toHaveBeenCalled();
		});

		it('lets the judge through once the round is published', async () => {
			const { req, res, next } = await judgeBallot({ published: 1 });

			await requireRoundOutToJudges(req, res, next);

			expect(next).toHaveBeenCalledWith();
		});

		it('lets the judge through an unpublished round with judges_ballots_visible', async () => {
			const { req, res, next } = await judgeBallot({ published: 0, settings: { judges_ballots_visible: '1' } });

			await requireRoundOutToJudges(req, res, next);

			expect(next).toHaveBeenCalledWith();
		});

		it('hides rounds published only for brackets or listings', async () => {
			const { req, res, next } = await judgeBallot({ published: 3 });

			await requireRoundOutToJudges(req, res, next);

			expect(res.statusCode).toBe(404);
		});

		it('lets tab staff through before the round is published', async () => {
			const { req, res, next } = await judgeBallot({ published: 0 }, 'tabber');

			await requireRoundOutToJudges(req, res, next);

			expect(next).toHaveBeenCalledWith();
		});
	});

	it.each([['judgeId', { judgeId: 'abc', panelId: '1' }], ['panelId', { judgeId: '1', panelId: '0' }]])('returns 400 for a malformed %s', async (param, params) => {
		const { req, res, next } = createPersonContext(await factories.person.create(), { params });

		await requireRoundOutToJudges(req, res, next);

		expect(res.statusCode).toBe(400);
		expect(res.body).toMatchObject({ detail: `${param} must be a positive integer` });
		expect(next).not.toHaveBeenCalled();
	});

	it('passes anonymous callers through without checking', async () => {
		const { req, res, next } = createContext({
			params: { judgeId: '999999999', panelId: '999999999' },
		});
		req.actor = createActor(req.db, null);

		await requireRoundOutToJudges(req, res, next);

		expect(next).toHaveBeenCalledWith();
		expect(res.status).not.toHaveBeenCalled();
	});
});
