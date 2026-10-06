import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { faker } from '@faker-js/faker';
import { FileSchema, ScheduleRoundSchema, TournInviteSchema, TournSchema } from '@tabroom/types';
import z from 'zod';

let testTourn: Awaited<ReturnType<typeof factories.tourn.create>>;
beforeAll(async () => {
	testTourn = await factories.tourn.create();
	await factories.file.create({ tourn: testTourn.id, published: true });
});

describe('GET /rest/tourns', () => {
	it('Returns the correct shape for the circuit calendar request', async () => {
		//create a circuit and tourn
		const startBefore = faker.date.future();
		const startAfter = faker.date.past();
		const tournDate = faker.date.between({from: startAfter, to: startBefore});
		const Circuit = await factories.circuit.create();
		const Tourn = await factories.tourn.create({ circuit: Circuit.id, start: tournDate });
		await factories.event.create({ tourn: Tourn.id, abbr: 'ABBR' });
		const res = await request(server)
            .get(`/v1/rest/tourns?circuit=${Circuit.id}&startAfter=${startAfter.toISOString()}&startBefore=${startBefore.toISOString()}&limit=10`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		const body = res.body;
		expect(body).toBeDefined();
		expect(body).toMatchSchema(z.array(TournSchema));
		const tourn = body.find((t: { id: number }) => t.id === Tourn.id);
		expect(tourn).toBeDefined();
	});
	it('Returns the correct shape for the results request', async () => {
		//create a circuit and tourn
		const startBefore = faker.date.future();
		const startAfter = faker.date.past();
		const tournDate = faker.date.between({from: startAfter, to: startBefore});
		const Tourn = await factories.tourn.create({ start: tournDate });
		await factories.resultSet.create({ tourn: Tourn.id, published: 1 });
		const res = await request(server)
            .get(`/v1/rest/tourns?startAfter=${startAfter.toISOString()}&startBefore=${startBefore.toISOString()}&limit=10&publishedResults=true`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		const body = res.body;
		expect(body).toBeDefined();
		expect(body).toMatchSchema(z.array(TournSchema));
		expect(body.length).toBeGreaterThan(0);
	});
});
describe('GET /rest/tourns/:tournId', () => {
	it('Returns a public tournament', async () => {
		const res = await request(server)
            .get(`/v1/rest/tourns/${testTourn.id}`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(TournSchema);
		expect(res.body.id).toBe(testTourn.id);
	});
});
describe('GET /rest/tourns/:tournId/invite', () => {
	it('Returns the invite for a public tournament', async () => {
		const { webpageId } = await factories.webpage.create({ tourn: testTourn.id });

		const res = await request(server)
            .get(`/v1/rest/tourns/${testTourn.id}/invite`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(TournInviteSchema);
		expect(res.body.id).toBe(testTourn.id);
		expect(res.body.Webpages.some((page: { id: number }) => page.id === webpageId)).toBe(true);
	});

	it('Returns invite events with their public settings', async () => {
		// Long enough that saveSettings stores it in value_text like legacy descriptions
		const description = faker.lorem.paragraph({ min: 5, max: 6 });
		const tourn = await factories.tourn.create();
		const category = await factories.category.create({ tourn: tourn.id });
		const event = await factories.event.create({
			tourn: tourn.id,
			category: category.id,
			type: 'mock_trial',
			fee: '25.00',
			settings: {
				cap: '40',
				school_cap: '4',
				field_report: '1',
				description,
			},
		});
		await factories.entry.create({ event: event.id });

		const res = await request(server)
            .get(`/v1/rest/tourns/${tourn.id}/invite`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(TournInviteSchema);
		const inviteEvent = res.body.Events.find((e: { id: number }) => e.id === event.id);
		expect(inviteEvent).toMatchObject({
			type: 'mockTrial',
			Category: { id: category.id },
			settings: {
				cap: '40',
				schoolCap: '4',
				fieldReport: '1',
				description,
			},
			metadata: { entryCount: 1 },
		});
		expect(res.body.inPerson).toBe(1);
		expect(res.body.hybrid).toBe(0);
	});

	it('Counts online and hybrid events', async () => {
		const tourn = await factories.tourn.create();
		const category = await factories.category.create({ tourn: tourn.id });
		await factories.event.create({
			tourn: tourn.id,
			category: category.id,
			type: 'debate',
			settings: { online_mode: 'nsda_campus' },
		});
		await factories.event.create({
			tourn: tourn.id,
			category: category.id,
			type: 'speech',
			settings: { online_mode: 'nsda_campus', online_hybrid: true },
		});

		const res = await request(server)
            .get(`/v1/rest/tourns/${tourn.id}/invite`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(TournInviteSchema);
		expect(res.body.inPerson).toBe(0);
		expect(res.body.hybrid).toBe(1);
	});
});
describe('GET /rest/tourns/:tournId/schedule', () => {
	it('Returns the rounds in the tournament schedule', async () => {
		// The schedule leaves out attendee events, so the event type is fixed
		const { Tourn, Round } = await factories.tourn.createFull({ Event: { type: 'debate' } });

		const res = await request(server)
            .get(`/v1/rest/tourns/${Tourn.id}/schedule`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(z.array(ScheduleRoundSchema));
		expect(res.body.map((round: { id: number }) => round.id)).toContain(Round.id);
	});
});
describe('GET /rest/tourns/:id/files', () => {
	it('should return the files for a specific tourn', async () => {
		const res = await request(server)
            .get(`/v1/rest/tourns/${testTourn.id}/files`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200);

		expect(res.body).toMatchSchema(z.array(FileSchema));
	});
	it('should return 404 if the tourn does not exist', async () => {
		const res = await request(server)
            .get(`/v1/rest/tourns/9999/files`)
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/);

		expect(res).toBeProblemResponse(404);
	});
});

