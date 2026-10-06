import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { JudgeRecordSchema, ParadigmDetailsSchema, ParadigmSearchResultSchema } from '@tabroom/types';
import z from 'zod';

async function createSetup() {
	const { Person } = await factories.person.createJudge({
		settings: {
			'paradigm': 'test',
		},
	});
	const { userkey } = await factories.session.create();
	return { Person, userkey };
}
describe('GET /rest/paradigms', () => {
	let setup: Awaited<ReturnType<typeof createSetup>>;
	beforeAll(async () => {
		setup = await createSetup();
	});

	it('Returns paradigms with no params', async () => {
		const res = await request(server)
            .get(`/v1/rest/paradigms`)
			.asPerson(setup.userkey)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		const body = res.body;
		expect(body).toMatchSchema(z.array(ParadigmSearchResultSchema));
		expect(body.length).toBeGreaterThan(0);
	});
	it('returns paradigms with search params', async () => {
		const res = await request(server)
            .get(`/v1/rest/paradigms?search="${setup.Person.first} ${setup.Person.last}"`)
			.asPerson(setup.userkey)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		const body = res.body;
		expect(body).toMatchSchema(z.array(ParadigmSearchResultSchema));
		expect(body.length).toBeGreaterThan(0);
		expect(body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: setup.Person.id,
				}),
			])
		);
	});
});
describe('GET /rest/paradigms/:personId', () => {
	let setup: Awaited<ReturnType<typeof createSetup>>;
	beforeAll(async () => {
		setup = await createSetup();
	});

	it('Returns paradigm details for a specific person', async () => {
		const res = await request(server)
            .get(`/v1/rest/paradigms/${setup.Person.id}`)
			.asPerson(setup.userkey)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(ParadigmDetailsSchema);
	});
});
describe('GET /rest/paradigms/:personId/record', () => {
	let setup: Awaited<ReturnType<typeof createSetup>>;
	beforeAll(async () => {
		setup = await createSetup();
	});

	it('Returns judging record for a specific person', async () => {
		const res = await request(server)
            .get(`/v1/rest/paradigms/${setup.Person.id}/record`)
			.asPerson(setup.userkey)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		const body = res.body;
		expect(body).toMatchSchema(z.array(JudgeRecordSchema));
	});
});

