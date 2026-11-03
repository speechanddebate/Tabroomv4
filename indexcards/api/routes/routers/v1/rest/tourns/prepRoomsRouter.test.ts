import request from 'supertest';
import { OnlineRoomJoinSchema, OnlineRoomSchema } from '@tabroom/types';
import server from '../../../../../../app.js';
import config from '../../../../../config.js';
import factories from '../../../../../../tests/factories/index.js';

describe('/rest/tourns/:tournId/prep-rooms/:entryId', () => {
	const originalKey = config.campus.key;
	let tournId: number;
	let entryId: number;
	let noPrepEntryId: number;
	let studentUserkey: string;
	let otherUserkey: string;

	const url = (entry: number) => `/v1/rest/tourns/${tournId}/prep-rooms/${entry}`;

	beforeAll(async () => {
		const { Tourn, Category, Event } = await factories.tourn.createFull({ Event: { settings: { online_mode: 'nsda_campus', online_prep: 1 } } });
		const noPrepEvent = await factories.event.create({ tourn: Tourn.id, category: Category.id, settings: { online_mode: 'nsda_campus' } });
		tournId = Tourn.id;

		const studentPerson = await factories.person.create();
		const student = await factories.student.create({ person: studentPerson.id });
		const entry = await factories.entry.create({ event: Event.id, code: 'AB', students: [student.id] });
		const noPrepEntry = await factories.entry.create({ event: noPrepEvent.id, students: [student.id] });
		entryId = entry.id;
		noPrepEntryId = noPrepEntry.id;

		({ userkey: studentUserkey } = await factories.session.create({ person: studentPerson.id }));
		({ userkey: otherUserkey } = await factories.session.create());
	});

	afterEach(() => {
		config.campus.key = originalKey;
	});

	it('returns the prep room to the entry\'s student', async () => {
		const res = await request(server).get(url(entryId)).asPerson(studentUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(OnlineRoomSchema);
		expect(res.body.name).toBe('AB Prep Room');
	});

	it('returns 404 for an event without prep rooms', async () => {
		const res = await request(server).get(url(noPrepEntryId)).asPerson(studentUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 to a person with no part in the entry', async () => {
		const res = await request(server).get(url(entryId)).asPerson(otherUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for an entry that does not exist', async () => {
		const res = await request(server).get(url(999999999)).asPerson(studentUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('joins the prep room', async () => {
		config.campus.key = 'test-campus-key';

		const res = await request(server).post(`${url(entryId)}/join`).asPerson(studentUserkey);

		expect(res.status).toBe(201);
		expect(res.body).toMatchSchema(OnlineRoomJoinSchema);
		expect(res.body.token).toEqual(expect.any(String));
	});
});
