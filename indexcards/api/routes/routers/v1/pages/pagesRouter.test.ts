import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { NSDACategorySchema, RoundResultsSchema, TournByWebnameSchema, UpcomingSchema } from '@tabroom/types';
import { faker } from '@faker-js/faker';
import z from 'zod';

describe('GET /pages/invite/upcoming', () => {
	it('Returns upcoming tournaments and district weekends', async () => {
		const { Tourn } = await factories.tourn.createFull();

		const res = await request(server)
			.get(`/v1/pages/invite/upcoming`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);
			
		expect(res.body).toMatchSchema(z.array(UpcomingSchema));
		expect(res.body.some((tourn: { tournId: number }) => tourn.tournId === Tourn.id)).toBe(true);
		expect(res.body.some((tourn: { districts: string }) => tourn.districts === 'Yes')).toBe(true);
	});
	it('Filters by state and limits the number of results', async () => {
		const res = await request(server)
			.get(`/v1/pages/invite/upcoming?limit=1&state=il`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(UpcomingSchema));
		expect(res.body.length).toBeLessThanOrEqual(1);
		expect(res.body.every((tourn: { state: string }) => tourn.state === 'IL')).toBe(true);
	});
	it('Rejects a limit or state that is not valid', async () => {
		const badLimit = await request(server)
			.get(`/v1/pages/invite/upcoming?limit=${encodeURIComponent('1; drop table tourn')}`)
			.set('Accept', 'application/json');
		expect(badLimit).toBeProblemResponse(400);

		const badState = await request(server)
			.get(`/v1/pages/invite/upcoming?state=${encodeURIComponent("'#")}`)
			.set('Accept', 'application/json');
		expect(badState).toBeProblemResponse(400);
	});
});

describe('GET /pages/invite/nsdaCategories', () => {
	it('Returns the NSDA event categories', async () => {
		const res = await request(server)
			.get(`/v1/pages/invite/nsdaCategories`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(NSDACategorySchema));
		expect(res.body.length).toBeGreaterThan(0);
	});
});

describe('GET /pages/invite/:tournId/:eventAbbr/:roundName/results', () => {
	it('Returns win loss results for a debate round', async () => {
		const res = await request(server)
			.get(`/v1/pages/invite/31059/CX/5/results`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(RoundResultsSchema);
		expect(res.body.Event.Settings.primaryScore).toBe('winloss');
	});
	it('Returns ranked results for a congress round', async () => {
		const res = await request(server)
			.get(`/v1/pages/invite/26661/HSE/3/results`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(RoundResultsSchema);
		expect(res.body.Event.Settings.primaryScore).toBe('rank');
	});
	it('Returns 404 when the round has no public results', async () => {
		const res = await request(server)
			.get(`/v1/pages/invite/31059/CX/999/results`)
			.set('Accept', 'application/json');

		expect(res).toBeProblemResponse(404);
	});
});

describe('GET /pages/invite/webname/:webname', () => {
	it('Returns a tournament by webname', async () => {
		const Tourn = await factories.tourn.create({ webname: faker.string.alpha(16) });

		const res = await request(server)
			.get(`/v1/pages/invite/webname/${Tourn.webname}`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(TournByWebnameSchema);
		expect(res.body.id).toBe(Tourn.id);
	});
	it('Returns an older tournament by id with its id as the webname', async () => {
		const webname = faker.string.alpha(16);
		const Older = await factories.tourn.create({ webname, start: faker.date.past() });
		await factories.tourn.create({ webname, start: faker.date.future() });

		const res = await request(server)
			.get(`/v1/pages/invite/webname/${Older.id}`)
			.set('Accept', 'application/json')
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(TournByWebnameSchema);
		expect(res.body.webname).toBe(Older.id);
		expect(res.body.settings).toEqual({ multiYear: true, notCurrent: true });
	});
});
