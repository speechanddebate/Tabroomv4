import factories from '../../tests/factories/index.js';
import { createContext, createPersonContext } from '../../tests/httpMocks.js';
import { createActor } from '../middleware/auth/authorization.js';
import { requireJudgeOnPanel } from './judgePolicy.js';

describe('requireJudgeOnPanel', () => {
	it('passes when the judge has a ballot on the panel', async () => {
		const judge = await factories.judge.create();
		const ballot = await factories.ballot.create({ judge: judge.id });
		const { req, res, next } = createPersonContext(await factories.person.create(), {
			params: { judgeId: String(judge.id), panelId: String(ballot.panel) },
		});

		await requireJudgeOnPanel(req, res, next);

		expect(next).toHaveBeenCalledWith();
		expect(res.status).not.toHaveBeenCalled();
	});

	it('returns 404 when the judge has no ballot on the panel', async () => {
		const judge = await factories.judge.create();
		const otherJudge = await factories.judge.create();
		const ballot = await factories.ballot.create({ judge: otherJudge.id });
		const { req, res, next } = createPersonContext(await factories.person.create(), {
			params: { judgeId: String(judge.id), panelId: String(ballot.panel) },
		});

		await requireJudgeOnPanel(req, res, next);

		expect(res.statusCode).toBe(404);
		expect(next).not.toHaveBeenCalled();
	});

	it('passes anonymous callers through without checking', async () => {
		const { req, res, next } = createContext({
			params: { judgeId: '999999999', panelId: '999999999' },
		});
		req.actor = createActor(req.db, null);

		await requireJudgeOnPanel(req, res, next);

		expect(next).toHaveBeenCalledWith();
		expect(res.status).not.toHaveBeenCalled();
	});
});
