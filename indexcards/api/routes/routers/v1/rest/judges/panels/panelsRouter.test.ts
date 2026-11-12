import request from 'supertest';
import server from '../../../../../../../app.js';
import factories from '../../../../../../../tests/factories/index.js';

// Protection for everything under /v1/rest/judges/:judgeId/panels/:panelId.
// GET /ballots returns 200 and the rest are 501 stubs, so either means every guard passed
describe('/rest/judges/:judgeId/panels/:panelId', () => {
	let judgeUserkey: string;
	let otherUserkey: string;
	let judgeId: number;
	let panelId: number;
	let releasedRoundId: number;
	// The same judge's ballot on a round that isn't out to judges yet
	let unpublishedPanelId: number;

	beforeAll(async () => {
		const person = await factories.person.create();
		({ userkey: judgeUserkey } = await factories.session.create({ person: person.id }));
		({ userkey: otherUserkey } = await factories.session.create());

		const { Category, Event, Round } = await factories.tourn.createFull();
		const judge = await factories.judge.create({ person: person.id, category: Category.id });
		const panel = await factories.panel.create({ round: Round.id });
		await factories.ballot.create({ judge: judge.id, panel: panel.id });
		judgeId = judge.id;
		panelId = panel.id;
		releasedRoundId = Round.id;

		const unpublishedRound = await factories.round.create({ event: Event.id, published: 0 });
		const unpublishedPanel = await factories.panel.create({ round: unpublishedRound.id });
		await factories.ballot.create({ judge: judge.id, panel: unpublishedPanel.id });
		unpublishedPanelId = unpublishedPanel.id;
	});

	it.each([
		['get', ''],
		['get', '/status'],
		['post', '/start'],
		['post', '/confirm'],
	] as const)('returns 404 to the judge on %s /ballots%s before the round is out to judges', async (method, path) => {
		const res = await request(server)[method](url(judgeId, unpublishedPanelId) + path).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
		expect(res.body.detail).toBe(`Judge ${judgeId} has no ballot on panel ${unpublishedPanelId}`);
	});

	const url = (judge: number | string, panel: number | string) => `/v1/rest/judges/${judge}/panels/${panel}/ballots`;

	it('reaches the route for the judge on their own panel', async () => {
		const res = await request(server).get(url(judgeId, panelId)).asPerson(judgeUserkey);

		expect(res.status).toBe(200);
	});

	it('returns 400 for a malformed judge id', async () => {
		const res = await request(server).get(url('abc', panelId)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(400);
	});

	it('returns 400 for a malformed panel id', async () => {
		const res = await request(server).get(url(judgeId, 'abc')).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(400);
	});

	it('returns 404 for a judge that does not exist, as for one that is not the caller', async () => {
		const res = await request(server).get(url(999999999, panelId)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for a panel that does not exist', async () => {
		const res = await request(server).get(url(judgeId, 999999999)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 when the judge has no ballot on a panel in a released round', async () => {
		const otherPanel = await factories.panel.create({ round: releasedRoundId });

		const res = await request(server).get(url(judgeId, otherPanel.id)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('does not reveal whether the judge exists to anonymous callers', async () => {
		const missing = await request(server).get(url(999999999, panelId));
		const existing = await request(server).get(url(judgeId, panelId));

		expect(missing.status).toBe(existing.status);
	});

	// every route under /ballots, with the status it returns once every guard passes
	const routes: ['get' | 'put' | 'post', string, number][] = [
		['get', '', 200],
		['get', '/status', 200],
		['put', '', 400],
		['post', '/start', 200],
		// Nothing saved yet, so there's nothing to confirm
		['post', '/confirm', 409],
		['put', '/feedback', 400],
	];

	it.each(routes)('lets the judge through %s /ballots%s', async (method, path, status) => {
		const res = await request(server)[method](url(judgeId, panelId) + path).asPerson(judgeUserkey);

		expect(res.status).toBe(status);
	});

	// 404, not 403, so a stranger can't tell a released round from an unreleased one
	it.each(routes)('returns 404 on %s /ballots%s for a person who is not the judge', async (method, path) => {
		const res = await request(server)[method](url(judgeId, panelId) + path).asPerson(otherUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it.each(routes)('returns 401 on %s /ballots%s for anonymous callers', async (method, path) => {
		const res = await request(server)[method](url(judgeId, panelId) + path);

		expect(res).toBeProblemResponse(401);
	});
});
