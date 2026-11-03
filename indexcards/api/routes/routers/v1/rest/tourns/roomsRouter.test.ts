import request from 'supertest';
import z from 'zod';
import { OnlineRoomJoinSchema, UtilityRoomSchema } from '@tabroom/types';
import server from '../../../../../../app.js';
import { db } from '../../../../../data/database.js';
import factories from '../../../../../../tests/factories/index.js';

describe('/rest/tourns/:tournId/rooms', () => {
	let tournId: number;
	let coachUserkey: string;
	let checkerUserkey: string;
	let otherUserkey: string;

	const url = (tourn: number) => `/v1/rest/tourns/${tourn}/rooms`;

	beforeAll(async () => {
		const { Tourn } = await factories.tourn.createFull();
		tournId = Tourn.id;
		await db.insertInto('tourn_setting').values({
			tourn: Tourn.id,
			tag: 'online_rooms',
			value: 'json',
			value_text: JSON.stringify([
				{ id: '1', name: 'Coach Lounge', type: 'link', url: 'https://zoom.test/coach', access: 'coach' },
				{ id: '2', name: 'Tab Room', type: 'link', url: 'https://zoom.test/tab', access: 'tab' },
			]),
		}).execute();

		const chapter = await factories.chapter.create();
		await factories.school.create({ tourn: Tourn.id, chapter: chapter.id });
		const coach = await factories.person.create();
		await factories.permission.create({ person: coach.id, chapter: chapter.id, tag: 'chapter' });
		({ userkey: coachUserkey } = await factories.session.create({ person: coach.id }));

		const checker = await factories.person.create();
		await factories.permission.create({ person: checker.id, tourn: Tourn.id, tag: 'checker' });
		({ userkey: checkerUserkey } = await factories.session.create({ person: checker.id }));

		({ userkey: otherUserkey } = await factories.session.create());
	});

	it('lists the rooms a coach can see', async () => {
		const res = await request(server).get(url(tournId)).asPerson(coachUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(z.array(UtilityRoomSchema));
		expect(res.body).toEqual([{ id: 1, name: 'Coach Lounge', joinable: true, hybrid: false, mapUrl: null }]);
	});

	it('lists every room to a tourn checker', async () => {
		const res = await request(server).get(url(tournId)).asPerson(checkerUserkey);

		expect(res.body.map((room: { name: string }) => room.name)).toEqual(['Coach Lounge', 'Tab Room']);
	});

	it('lists nothing to a person with no part in the tourn', async () => {
		const res = await request(server).get(url(tournId)).asPerson(otherUserkey);

		expect(res.status).toBe(200);
		expect(res.body).toEqual([]);
	});

	it('returns 404 for a tourn that does not exist', async () => {
		const res = await request(server).get(url(999999999)).asPerson(coachUserkey);

		expect(res).toBeProblemResponse(404);
	});

	it('joins a room by id and name', async () => {
		const res = await request(server).post(`${url(tournId)}/1/join`).asPerson(coachUserkey).send({ name: 'Coach Lounge' });

		expect(res.status).toBe(201);
		expect(res.body).toMatchSchema(OnlineRoomJoinSchema);
		expect(res.body).toEqual({ url: 'https://zoom.test/coach', token: null, password: null });
	});

	it('returns 409 when the room at that id has changed', async () => {
		const res = await request(server).post(`${url(tournId)}/1/join`).asPerson(coachUserkey).send({ name: 'Old Lounge' });

		expect(res).toBeProblemResponse(409);
	});

	it('returns 404 joining a room the person can\'t see', async () => {
		const res = await request(server).post(`${url(tournId)}/2/join`).asPerson(coachUserkey).send({ name: 'Tab Room' });

		expect(res).toBeProblemResponse(404);
	});

	it('returns 400 without the room name', async () => {
		const res = await request(server).post(`${url(tournId)}/1/join`).asPerson(coachUserkey).send({});

		expect(res).toBeProblemResponse(400);
	});
});
