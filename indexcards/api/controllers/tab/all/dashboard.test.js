import request from 'supertest';
import { db } from '../../../data/database.js';
import server from '../../../../app';
import factories from '../../../../tests/factories';

const testTourn = {
	id     : 27074,
	name   : 'Cal Berkeley Invitational',
	round  : 1150315,
	panel  : 7212079,
	entry  : 5141238,
	person : 8157,
	judge  : 2143673,
};

describe('Status Board', () => {
	let personId, userkey;
	beforeAll(async () => {
		const session = await factories.session.create();
		userkey = session.userkey;
		personId = session.person;
		const permission = {
			person : personId,
			tourn  : testTourn.id,
			tag    : 'tabber',
		};

		await factories.permission.create(permission);

		const campusLogs = [
			{ 	tag         : 'present',
				description : 'LASA marked as present by testrunner',
				entry       : testTourn.entry,
				marker      : personId,
				tourn       : testTourn.id,
				panel       : testTourn.panel,
			},
			{ 	tag         : 'present',
				description : 'Cayman marked as present by testrunner',
				person      : testTourn.person,
				marker      : personId,
				tourn       : testTourn.id,
				panel       : testTourn.panel,
			},
		];

		await db.insertInto('campus_log').values(campusLogs).execute();

	});

	it('Return a correct JSON status object', async () => {

		const res = await request(server)
			.get(`/v1/tab/tourns/${testTourn.id}/rounds/${testTourn.round}/attendance`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body, 'Response is an object').toBeTypeOf('object');

		expect(
			res.body.person[testTourn.person][testTourn.panel].tag,
			'Judge Giordano marked present by an admin'
		).toBe('present');

		expect(
			res.body.entry[testTourn.entry][testTourn.panel].tag,
			'LASA marked present by an admin'
		).toBe('present');

		expect(
			res.body.entry[testTourn.entry][testTourn.panel].markerId,
			'LASA marked present by the correct admin'
		).toBe(personId);
	});

	it('Reflects absence & presence changes in a new status object', async() => {

		// Mark Cayman as absent
		await request(server)
			.post(`/v1/tab/tourns/${testTourn.id}/all/attendance`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.send({
				targetId : testTourn.person,   	// person who was absent now present
				panel    : testTourn.panel, 	// panel ID
				present  : 0,
			})
			.expect('Content-Type', /json/)
			.expect(201);

		// Mark LASA as absent
		await request(server)
			.post(`/v1/tab/tourns/${testTourn.id}/all/attendance`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.send({
				targetId   : testTourn.entry,
				panel      : testTourn.panel,
				targetType : `entry`,
				present    : 0,
			})
			.expect('Content-Type', /json/)
			.expect(201);

		// Mark Ediger ballot as started
		await request(server)
			.post(`/v1/tab/tourns/${testTourn.id}/all/attendance`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.send({
				targetId      : testTourn.judge,
				panel         : 7212078,
				targetType    : `judge`,
				setting_name  : `judge_started`,
				property_name : 0,
			})
			.expect('Content-Type', /json/)
			.expect(201);

		const newResponse = await request(server)
			.get(`/v1/tab/tourns/${testTourn.id}/rounds/${testTourn.round}/attendance`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(newResponse.body, 'Response is indeed an object').toBeTypeOf('object');
		const newBody = newResponse.body;

		expect(
			newBody.person[testTourn.person][testTourn.panel].tag,
			'After the change posted, Judge Giordano marked absent by an admin'
		).toBe('present');

		expect(
			newBody.entry[testTourn.entry][testTourn.panel].tag,
			'LASA marked present by an admin'
		).toBe('present');

		expect(
			newBody.entry[testTourn.entry][testTourn.panel].markerId,
			'LASA marked present by the correct admin'
		).toBe(personId);
	});

	afterAll(async () => {

		await db.deleteFrom('campus_log')
			.where('marker', '=', personId)
			.execute();
	});

});

describe.todo('Event Dashboard', () => {
	let personId, userkey;
	beforeAll(async () => {
		const session = await factories.session.create();
		userkey = session.userkey;
		personId = session.personId;
		const permission = {
			person : personId,
			tourn  : testTourn.id,
			tag    : 'tabber',
		};

		await factories.permission.create(permission);
	});

	it('Return a correct JSON status object for the event dashboard', async () => {
		const res = await request(server)
			.get(`/v1/tab/tourns/${testTourn.id}/status/dashboard`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body, 'Response is an object').toBeTypeOf('object');
		expect(res.body[7].abbr, 'Event 7 is LD').toBe('LD');
		expect(res.body[7].rounds[1][1].unstarted, '25 unstarted in Round 1 flight 1').toBe(25);
		expect(res.body[7].rounds[1][2].undone, 'Flight 2 is not done').toBe(true);
	});
});
