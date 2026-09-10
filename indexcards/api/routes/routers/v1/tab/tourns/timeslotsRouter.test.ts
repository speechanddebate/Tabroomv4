//test for the timeslots endpoints
import request from 'supertest';
import app from '../../../../../../app.js';
import factories from '../../../../../../tests/factories/index.js';

let tournId: number | null = null;
let personId: number | null = null;
let userkey: string | null = null;

describe('Timeslots', () => {
	beforeAll(async () => {
		({tournId} = await factories.tourn.createTestTourn());
		({personId} = await factories.person.create({site_admin: 1}));
		({userkey} = await factories.session.create({person: personId}));
	});

	describe('POST /tourns/:tournId/timeslots', () => {
		it('creates a new timeslot with valid data', async () => {
			const timeslotData = factories.timeslot.createTimeslotData({ tourn: tournId });
			const response = await request(app)
				.post(`/v1/tab/tourns/${tournId}/timeslots`)
				.set('Authorization', `Bearer ${userkey}`)
				.send(timeslotData)
				.expect(201);
			expect(response.body).toBeDefined();
			expect(response.body.name).toBe(timeslotData.name);
			expect(new Date(response.body.start).getTime()).toBe(timeslotData.start.getTime());
			expect(new Date(response.body.end).getTime()).toBe(timeslotData.end.getTime());
			expect(response.body.tourn).toBe(tournId);
		});
		it('returns 400 Bad Request for invalid data', async () => {
			const invalidData = { name: '', start: 'invalid-date', end: 'invalid-date', tournId };
			const res = await request(app)
				.post(`/v1/tab/tourns/${tournId}/timeslots`)
				.set('Authorization', `Bearer ${userkey}`)
				.send(invalidData);

			expect(res).toBeProblemResponse(400);
		});
	});
	it('GET /tourns/:tournId/timeslots returns a list of timeslots for the tournament', async () => {
		await factories.timeslot.create({ tourn: tournId });
		const response = await request(app)
			.get(`/v1/tab/tourns/${tournId}/timeslots`)
			.set('Authorization', `Bearer ${userkey}`)
			.expect(200);
		expect(Array.isArray(response.body)).toBe(true);
		expect(response.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					tourn: tournId,
					id: expect.any(Number),
					name: expect.any(String),
					start: expect.any(String),
					end: expect.any(String),
				}),
			]),
		);
	});
	it('PUT /tourns/:tournId/timeslots/:timeslotId updates the timeslot', async () => {
		const timeslotData = factories.timeslot.createTimeslotData({ tourn: tournId });
		const timeslot = await factories.timeslot.create(timeslotData);
		const updatedData = {
			...timeslotData,
			name: 'Updated Timeslot Name',
		};
		await request(app)
			.put(`/v1/tab/tourns/${tournId}/timeslots/${timeslot.id}`)
			.set('Authorization', `Bearer ${userkey}`)
			.send(updatedData)
			.expect(204);
		const getResponse = await request(app)
			.get(`/v1/tab/tourns/${tournId}/timeslots/${timeslot.id}`)
			.set('Authorization', `Bearer ${userkey}`)
			.expect(200);
		expect(getResponse.body.name).toBe(updatedData.name);
		expect(new Date(getResponse.body.start).getTime()).toBe(updatedData.start.getTime());
		expect(new Date(getResponse.body.end).getTime()).toBe(updatedData.end.getTime());
		expect(getResponse.body.tourn).toBe(tournId);
	});
});