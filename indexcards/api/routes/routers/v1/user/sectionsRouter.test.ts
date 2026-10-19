import request from 'supertest';
import { OnlineRoomSchema } from '@tabroom/types';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';

describe('GET /user/sections/:sectionId/room', () => {
	let panelId: number;
	let tournId: number;
	let eventId: number;
	let categoryId: number;
	let judgeUserkey: string;
	let studentUserkey: string;
	let otherUserkey: string;

	const url = (section: number | string) => `/v1/user/sections/${section}/room`;

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
		eventId = Event.id;
		categoryId = Category.id;

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
		expect(res.body).toMatchSchema(OnlineRoomSchema);
		expect(res.body).toEqual({ name: 'PF A', joinable: true, hybrid: false, mapUrl: null });
	});

	it('returns the room to a competitor in the section', async () => {
		const res = await request(server).get(url(panelId)).asPerson(studentUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(OnlineRoomSchema);
	});

	it.each([
		['tourn', () => ({ tourn: tournId })],
		['event', () => ({ tourn: tournId, event: eventId })],
		['category', () => ({ tourn: tournId, category: categoryId })],
	])('returns the room to a %s checker', async (_scope, perm) => {
		const userkey = await checker(perm());

		const res = await request(server).get(url(panelId)).asPerson(userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(OnlineRoomSchema);
	});

	it('returns 404 to a checker of another category', async () => {
		const otherCategory = await factories.category.create({ tourn: tournId });
		const userkey = await checker({ tourn: tournId, category: otherCategory.id });

		const res = await request(server).get(url(panelId)).asPerson(userkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 to a person with no part in the section', async () => {
		const res = await request(server).get(url(panelId)).asPerson(otherUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('returns 404 for a section that does not exist', async () => {
		const res = await request(server).get(url(999999999)).asPerson(judgeUserkey);

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
