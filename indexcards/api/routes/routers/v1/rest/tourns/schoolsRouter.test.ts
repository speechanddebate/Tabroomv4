import request from 'supertest';
import { jwtVerify } from 'jose';
import { OnlineRoomJoinSchema, OnlineRoomSchema } from '@tabroom/types';
import server from '../../../../../../app.js';
import config from '../../../../../config.js';
import factories from '../../../../../../tests/factories/index.js';

describe('/rest/tourns/:tournId/schools/:schoolId/room', () => {
	const originalKey = config.campus.key;
	let schoolId: number;
	let tournId: number;
	let coachUserkey: string;
	let otherUserkey: string;

	beforeAll(async () => {
		const { Tourn } = await factories.tourn.createFull({ Event: { settings: { online_mode: 'nsda_campus' } } });
		tournId = Tourn.id;
		const chapter = await factories.chapter.create();
		const school = await factories.school.create({ tourn: Tourn.id, chapter: chapter.id, name: 'Lincoln HS' });
		schoolId = school.id;

		const coach = await factories.person.create();
		await factories.permission.create({ person: coach.id, chapter: chapter.id, tag: 'chapter' });
		({ userkey: coachUserkey } = await factories.session.create({ person: coach.id }));
		({ userkey: otherUserkey } = await factories.session.create());
	});

	afterEach(() => {
		config.campus.key = originalKey;
	});

	it('returns the squad room to a coach', async () => {
		const res = await request(server).get(`/v1/rest/tourns/${tournId}/schools/${schoolId}/room`).asPerson(coachUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(OnlineRoomSchema);
		expect(res.body.name).toBe('Lincoln HS Squad Room');
	});

	it('returns the squad room to a tourn checker', async () => {
		const person = await factories.person.create();
		await factories.permission.create({ person: person.id, tourn: tournId, tag: 'checker' });
		const { userkey } = await factories.session.create({ person: person.id });

		const res = await request(server).get(`/v1/rest/tourns/${tournId}/schools/${schoolId}/room`).asPerson(userkey);

		expect(res.status).toBe(200);
	});

	it('returns 404 to a person with no part in the school', async () => {
		const res = await request(server).get(`/v1/rest/tourns/${tournId}/schools/${schoolId}/room`).asPerson(otherUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for a school that does not exist', async () => {
		const res = await request(server).get(`/v1/rest/tourns/${tournId}/schools/999999999/room`).asPerson(coachUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('joins the squad room with a Campus token', async () => {
		config.campus.key = 'test-campus-key';

		const res = await request(server).post(`/v1/rest/tourns/${tournId}/schools/${schoolId}/room/join`).asPerson(coachUserkey);

		expect(res.status).toBe(201);
		expect(res.body).toMatchSchema(OnlineRoomJoinSchema);
		const { payload } = await jwtVerify(res.body.token, new TextEncoder().encode('test-campus-key'));
		expect(payload).toMatchObject({ panel_type: 'school', panel_id: schoolId });
	});

	it('returns 503 joining without a Campus key', async () => {
		config.campus.key = undefined;

		const res = await request(server).post(`/v1/rest/tourns/${tournId}/schools/${schoolId}/room/join`).asPerson(coachUserkey);

		expect(res).toBeProblemResponse(503);
	});
});
