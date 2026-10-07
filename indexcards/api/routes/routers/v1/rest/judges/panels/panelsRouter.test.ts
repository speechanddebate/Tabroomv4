import request from 'supertest';
import server from '../../../../../../../app.js';
import factories from '../../../../../../../tests/factories/index.js';

// Protection for everything under /v1/rest/judges/:judgeId/panels/:panelId.
// The ballot routes are 501 stubs, so a 501 means every guard passed
describe('/rest/judges/:judgeId/panels/:panelId', () => {
	let judgeUserkey: string;
	let otherUserkey: string;
	let judgeId: number;
	let panelId: number;

	beforeAll(async () => {
		const person = await factories.person.create();
		({ userkey: judgeUserkey } = await factories.session.create({ person: person.id }));
		({ userkey: otherUserkey } = await factories.session.create());

		const category = await factories.category.create({ tourn: (await factories.tourn.create()).id });
		const judge = await factories.judge.create({ person: person.id, category: category.id });
		const ballot = await factories.ballot.create({ judge: judge.id });
		judgeId = judge.id;
		panelId = ballot.panel;
	});

	const url = (judge: number | string, panel: number | string) => `/v1/rest/judges/${judge}/panels/${panel}/ballots`;

	it('reaches the route for the judge on their own panel', async () => {
		const res = await request(server).get(url(judgeId, panelId)).asPerson(judgeUserkey);

		expect(res.status).toBe(501);
	});

	it('returns 400 for a malformed judge id', async () => {
		const res = await request(server).get(url('abc', panelId)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(400);
	});

	it('returns 400 for a malformed panel id', async () => {
		const res = await request(server).get(url(judgeId, 'abc')).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(400);
	});

	it('returns 404 for a judge that does not exist', async () => {
		const res = await request(server).get(url(999999999, panelId)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for a panel that does not exist', async () => {
		const res = await request(server).get(url(judgeId, 999999999)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 when the judge has no ballot on the panel', async () => {
		const otherPanel = await factories.panel.create();

		const res = await request(server).get(url(judgeId, otherPanel.id)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('does not reveal whether the judge exists to anonymous callers', async () => {
		const missing = await request(server).get(url(999999999, panelId));
		const existing = await request(server).get(url(judgeId, panelId));

		expect(missing.status).toBe(existing.status);
	});

	// every route under /ballots, with the action it checks
	const routes: ['get' | 'put' | 'post', string][] = [
		['get', ''],
		['get', '/status'],
		['put', ''],
		['post', '/start'],
		['post', '/confirm'],
		['put', '/comments'],
	];

	it.each(routes)('lets the judge through %s /ballots%s', async (method, path) => {
		const res = await request(server)[method](url(judgeId, panelId) + path).asPerson(judgeUserkey);

		expect(res.status).toBe(501);
	});

	it.each(routes)('returns 403 on %s /ballots%s for a person who is not the judge', async (method, path) => {
		const res = await request(server)[method](url(judgeId, panelId) + path).asPerson(otherUserkey);

		expect(res).toBeProblemResponse(403);
	});

	it.each(routes)('returns 401 on %s /ballots%s for anonymous callers', async (method, path) => {
		const res = await request(server)[method](url(judgeId, panelId) + path);

		expect(res).toBeProblemResponse(401);
	});
});
