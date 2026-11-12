import request from 'supertest';
import { jwtVerify } from 'jose';
import { OnlineRoomJoinSchema, RoomViewSchema } from '@tabroom/types';
import server from '../../../../../../app.js';
import config from '../../../../../config.js';
import logger from '../../../../../helpers/logger.js';
import { db } from '../../../../../data/database.js';
import { campusUuid } from '../../../../../services/onlineRooms/campus.js';
import type { Settings } from '../../../../../repos/utils/index.js';
import factories from '../../../../../../tests/factories/index.js';

describe('GET /rest/tourns/:tournId/sections/:sectionId/room', () => {
	let panelId: number;
	let tournId: number;
	let judgeUserkey: string;
	let studentUserkey: string;
	let otherUserkey: string;

	const url = (section: number | string, tourn: number = tournId) => `/v1/rest/tourns/${tourn}/sections/${section}/room`;

	// a person with a checker perm on the tourn, event or category
	async function checker(perm: { tourn: number, event?: number, category?: number }, tag = 'checker') {
		const person = await factories.person.create();
		await factories.permission.create({ person: person.id, tag, ...perm });
		const { userkey } = await factories.session.create({ person: person.id });
		return userkey;
	}

	beforeAll(async () => {
		const { Tourn, Category, Event, Round } = await factories.tourn.createFull({
			Event: { abbr: 'PF', settings: { online_mode: 'nsda_campus' } },
		});
		tournId = Tourn.id;

		const panel = await factories.panel.create({ round: Round.id, letter: 'A' });
		panelId = panel.id;

		const judgePerson = await factories.person.create();
		const judge = await factories.judge.create({ person: judgePerson.id, category: Category.id });
		({ userkey: judgeUserkey } = await factories.session.create({ person: judgePerson.id }));

		const studentPerson = await factories.person.create();
		const student = await factories.student.create({ person: studentPerson.id });
		const entry = await factories.entry.create({ event: Event.id, students: [student.id] });
		({ userkey: studentUserkey } = await factories.session.create({ person: studentPerson.id }));

		await factories.ballot.create({ panel: panel.id, judge: judge.id, entry: entry.id });

		({ userkey: otherUserkey } = await factories.session.create());
	});

	it('returns the room to a judge in the section', async () => {
		const res = await request(server).get(url(panelId)).asPerson(judgeUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(RoomViewSchema);
		expect(res.body).toEqual({ name: 'PF A', joinable: true, hybrid: false, mapUrl: null });
	});

	it('returns the room to a competitor in the section', async () => {
		const res = await request(server).get(url(panelId)).asPerson(studentUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(RoomViewSchema);
	});

	it('returns the room to a checker', async () => {
		const userkey = await checker({ tourn: tournId });

		const res = await request(server).get(url(panelId)).asPerson(userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(RoomViewSchema);
	});

	it('returns 404 to a person with no part in the section', async () => {
		const res = await request(server).get(url(panelId)).asPerson(otherUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for a section that does not exist', async () => {
		const res = await request(server).get(url(999999999)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for a section under another tourn', async () => {
		const other = await factories.tourn.createFull();

		const res = await request(server).get(url(panelId, other.Tourn.id)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 400 for a malformed section id', async () => {
		const res = await request(server).get(url('abc')).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(400);
	});

	it('returns 401 without a session', async () => {
		const res = await request(server).get(url(panelId));

		expect(res).toBeProblemResponse(401);
	});
});

describe('POST /rest/tourns/:tournId/sections/:sectionId/room/join', () => {
	const url = (tourn: number, section: number) => `/v1/rest/tourns/${tourn}/sections/${section}/room/join`;
	const originalKey = config.campus.key;

	afterEach(() => {
		config.campus.key = originalKey;
	});

	// a section with a judge and a competitor, each signed in, in a room with guest and host links
	async function createSection(eventSettings: Settings) {
		const { Tourn, Category, Event, Round } = await factories.tourn.createFull({ Event: { abbr: 'PF', settings: eventSettings } });
		const room = await factories.room.create({
			url: 'https://zoom.test/room',
			password: 'roompass',
			judge_url: 'https://zoom.test/host',
			judge_password: 'hostpass',
		});
		const panel = await factories.panel.create({ round: Round.id, room: room.id, letter: 'A' });

		const judgePerson = await factories.person.create();
		const judge = await factories.judge.create({ person: judgePerson.id, category: Category.id });
		const { userkey: judgeUserkey } = await factories.session.create({ person: judgePerson.id });

		const studentPerson = await factories.person.create();
		const student = await factories.student.create({ person: studentPerson.id });
		const entry = await factories.entry.create({ event: Event.id, students: [student.id] });
		const { userkey: studentUserkey } = await factories.session.create({ person: studentPerson.id });

		await factories.ballot.create({ panel: panel.id, judge: judge.id, entry: entry.id });

		return { Tourn, panel, judge, judgePerson, judgeUserkey, entry, studentPerson, studentUserkey };
	}

	const joinLogs = (panel: number, person: number) => db.selectFrom('campus_log')
		.selectAll()
		.where('panel', '=', panel)
		.where('person', '=', person)
		.execute();

	it('gives a judge the host link and logs the join', async () => {
		const { Tourn, panel, judge, judgePerson, judgeUserkey } = await createSection({ online_mode: 'sync' });

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(judgeUserkey);

		expect(res.status).toBe(201);
		expect(res.body).toMatchSchema(OnlineRoomJoinSchema);
		expect(res.body).toEqual({ url: 'https://zoom.test/host', token: null, password: 'hostpass' });

		const logs = await joinLogs(panel.id, judgePerson.id);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toMatchObject({ tag: 'panel', tourn: Tourn.id, judge: judge.id, entry: null });
	});

	it('gives a competitor the room link', async () => {
		const { Tourn, panel, entry, studentPerson, studentUserkey } = await createSection({ online_mode: 'sync' });

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(studentUserkey);

		expect(res.status).toBe(201);
		expect(res.body).toEqual({ url: 'https://zoom.test/room', token: null, password: 'roompass' });
		expect(await joinLogs(panel.id, studentPerson.id)).toEqual([expect.objectContaining({ entry: entry.id })]);
	});

	it('gives a tourn checker the host link', async () => {
		const { Tourn, panel } = await createSection({ online_mode: 'sync' });
		const person = await factories.person.create();
		await factories.permission.create({ person: person.id, tourn: Tourn.id, tag: 'checker' });
		const { userkey } = await factories.session.create({ person: person.id });

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(userkey);

		expect(res.status).toBe(201);
		expect(res.body.url).toBe('https://zoom.test/host');
	});

	it('lets tab staff, but not the judge, into a hidden tourn\'s room', async () => {
		const { Tourn, panel, judgeUserkey } = await createSection({ online_mode: 'sync' });
		await db.updateTable('tourn').set({ hidden: 1 }).where('id', '=', Tourn.id).execute();
		const person = await factories.person.create();
		await factories.permission.create({ person: person.id, tourn: Tourn.id, tag: 'checker' });
		const { userkey } = await factories.session.create({ person: person.id });

		expect(await request(server).post(url(Tourn.id, panel.id)).asPerson(judgeUserkey)).toBeProblemResponse(404);
		expect((await request(server).post(url(Tourn.id, panel.id)).asPerson(userkey)).status).toBe(201);
	});

	it('returns a signed Campus token for a Campus room', async () => {
		config.campus.key = 'test-campus-key';
		const { Tourn, panel, judgePerson, judgeUserkey } = await createSection({ online_mode: 'nsda_campus' });

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(judgeUserkey);

		expect(res.status).toBe(201);
		expect(res.body).toMatchSchema(OnlineRoomJoinSchema);
		expect(res.body).toMatchObject({ url: config.campus.uri, password: null });

		const { payload } = await jwtVerify(res.body.token, new TextEncoder().encode('test-campus-key'));
		expect(payload).toMatchObject({ uuid: campusUuid(panel.id, 'A'), role: 'judge', person_id: judgePerson.id });
		expect(await joinLogs(panel.id, judgePerson.id)).toHaveLength(1);
	});

	it('returns 503 and logs nothing when Campus has no key configured', async () => {
		config.campus.key = undefined;
		const error = vi.spyOn(logger, 'error');
		const { Tourn, panel, judgePerson, judgeUserkey } = await createSection({ online_mode: 'nsda_campus' });

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(503);
		expect(error).toHaveBeenCalledWith('Cannot join an NSDA Campus room: config.campus.key is not set');
		expect(await joinLogs(panel.id, judgePerson.id)).toHaveLength(0);
		error.mockRestore();
	});

	it('returns 409 and logs nothing for a room that can\'t be joined online', async () => {
		const { Tourn, panel, judgePerson, judgeUserkey } = await createSection({ online_mode: 'async' });

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(judgeUserkey);

		expect(res).toBeProblemResponse(409);
		expect(await joinLogs(panel.id, judgePerson.id)).toHaveLength(0);
	});

	it('returns 404 to a person with no part in the section', async () => {
		const { Tourn, panel } = await createSection({ online_mode: 'sync' });
		const { userkey } = await factories.session.create();

		const res = await request(server).post(url(Tourn.id, panel.id)).asPerson(userkey);

		expect(res).toBeProblemResponse(404);
	});
});
