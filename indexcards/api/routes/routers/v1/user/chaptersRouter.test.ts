import request from 'supertest';
import config from '../../../../config.js';
import server from '../../../../../app.js';
import z from 'zod';
import { UserChapterSchema } from '@tabroom/types';
import factories from '../../../../../tests/factories/index.js';

let userkey: string, personId: number, chapterId: number;
beforeAll(async () => {
	const session = await factories.session.create();
	({ chapterId } = await factories.chapter.create());
	userkey = session.userkey;
	personId = session.personId;
	await factories.permission.create({
		chapter : chapterId,
		person  : personId,
		tag     : 'chapter',
	});
});

it('Returns a list of chapters a person has permissions in', async () => {
	const res = await request(server)
		.get(`/v1/user/chapters`)
		.set('Accept', 'application/json')
		.set('Cookie', [`${config.cookie.name}=${userkey}`])
		.expect('Content-Type', /json/)
		.expect(200);

	expect(res.body).toMatchSchema(z.array(UserChapterSchema));
	expect(res.body.filter((chapter: { id: number }) => chapter.id === chapterId).length).toBe(1);
	const chapter = res.body.find((chapter: { id: number }) => chapter.id === chapterId);
	
	expect(chapter.id).toBe(chapterId);
	expect(chapter.permission).toBe('chapter');
});