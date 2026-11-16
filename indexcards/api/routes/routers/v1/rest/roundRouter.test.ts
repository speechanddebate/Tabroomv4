import request from 'supertest';
import server from '../../../../../app.js';
import { PublishedRoundSchema, type PublishedRound } from '@tabroom/types';
import factories from '../../../../../tests/factories/index.js';
import z from 'zod';

describe('GET /rounds', () => {
	it('Returns 401 to a logged-out caller', async () => {
		expect(await request(server).get(`/v1/rest/tourns/29807/rounds`)).toBeProblemResponse(401);
	});
	it('Returns published rounds for a tourn when given valid id', async () => {
		const { userkey } = await factories.session.create();
		const res = await request(server)
            .get(`/v1/rest/tourns/29807/rounds`)
			.asPerson(userkey)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		const body: PublishedRound[] = res.body;
		expect(body).toMatchSchema(z.array(PublishedRoundSchema));

		// Property test: every round must be published
		body.forEach((round) => {
			expect(round.published).toBe(1);
		});

		expect(body).toHaveLength(11);
	});
});

describe('GET /rounds/:roundId/results', () => {
	it('Returns 401 to a logged-out caller', async () => {
		expect(await request(server).get(`/v1/rest/tourns/29807/rounds/1/results`)).toBeProblemResponse(401);
	});
});
