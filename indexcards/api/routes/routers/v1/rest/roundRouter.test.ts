import request from 'supertest';
import server from '../../../../../app.js';
import { PublishedRoundSchema, type PublishedRound } from '@tabroom/types';
import z from 'zod';

describe('GET /rounds', () => {
	it('Returns published rounds for a tourn when given valid id', async () => {
		const res = await request(server)
            .get(`/v1/rest/tourns/29807/rounds`)
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
