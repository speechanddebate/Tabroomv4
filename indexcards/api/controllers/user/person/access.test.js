import request from 'supertest';
import { db } from '../../../data/database.js';
import server from '../../../../app';
import { testUserSession } from '../../../../tests/testFixtures';

//put in todo as there may be a better way to do this now
describe.todo('Session Last Access Updated', () => {

	beforeAll( async () => {
		await db.updateTable('session')
			.set({ last_access: new Date('2024-01-01T00:00:00Z') })
			.where('person', '=', testUserSession.person)
			.execute();
	});

	it('Updates Last Access Timestamp', async () => {

		const update = await request(server)
			.get(`/v1/user/updateLastAccess?forceUpdate=1`)
			.set('Accept', 'application/json')
			.asPerson(testUserSession.userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		let res = {};

		if (update) {
			res = await request(server)
				.get(`/v1/user/session`)
				.set('Accept', 'application/json')
				.asPerson(testUserSession.userkey)
				.expect('Content-Type', /json/)
				.expect(200);
		}

		expect(res.body, 'Response is an object').toBeTypeOf('object');
		expect(res.body.person, 'Correct User Session Returned').toBe(69);

		const lastAccess = new Date(res.body.last_access);

		expect(
			lastAccess.toDateString(),
			'Last Access date is set to present day'
		).toBe(new Date().toDateString());
	});
});
