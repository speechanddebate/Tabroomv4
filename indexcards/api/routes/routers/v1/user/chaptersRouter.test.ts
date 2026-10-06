import request from 'supertest';
import server from '../../../../../app.js';
import z from 'zod';
import { MySchoolSchema, NonTournChapterSchema, UserChapterSchema } from '@tabroom/types';
import factories from '../../../../../tests/factories/index.js';
import { db } from '../../../../data/database.js';
import { testUserChapterPerm, testUserSchoolContact } from '../../../../../tests/testFixtures.js';

let userkey: string, personId: number, chapterId: number;
beforeAll(async () => {
	const session = await factories.session.create();
	const Chapter = await factories.chapter.create();
	userkey = session.userkey;
	personId = session.person;
	chapterId = Chapter.id;
	await factories.permission.create({
		chapter : Chapter.id,
		person  : personId,
		tag     : 'chapter',
	});
});

it('Returns a list of chapters a person has permissions in', async () => {
	const res = await request(server)
		.get(`/v1/user/chapters`)
		.set('Accept', 'application/json')
		.asPerson(userkey)
		.expect('Content-Type', /json/)
		.expect(200);

	expect(res.body).toMatchSchema(z.array(UserChapterSchema));
	expect(res.body.filter((chapter: { id: number }) => chapter.id === chapterId).length).toBe(1);
	const chapter = res.body.find((chapter: { id: number }) => chapter.id === chapterId);
	
	expect(chapter.id).toBe(chapterId);
	expect(chapter.permission).toBe('chapter');
});

describe('byTourn', () => {
	let tournUserkey: string, tournPersonId: number;
	beforeAll(async () => {
		const session = await factories.session.create();
		tournUserkey = session.userkey;
		tournPersonId = session.person;
		await factories.permission.create({
			chapter : testUserChapterPerm.chapter,
			tourn   : testUserChapterPerm.tourn,
			person  : tournPersonId,
			tag     : 'chapter',
		});
		await factories.contact.create({
			school   : testUserSchoolContact.school,
			person   : tournPersonId,
			official : testUserSchoolContact.official,
			onsite   : testUserSchoolContact.onsite,
			email    : testUserSchoolContact.email,
		});
	});
	afterAll(async () => {
		await db.deleteFrom('permission').where('person', '=', tournPersonId).execute();
		await db.deleteFrom('contact').where('person', '=', tournPersonId).execute();
	});

	describe('GET /user/chapters/byTourn/{tournId}', () => {
		it('Returns correct JSON for school dashboard request', async () => {
			const res = await request(server)
				.get(`/v1/user/chapters/byTourn/${testUserSchoolContact.tourn}`)
				.set('Accept', 'application/json')
				.asPerson(tournUserkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body.chapters).toBeInstanceOf(Array);
			expect(res.body.events).toBeInstanceOf(Array);
			expect(res.body.chapters[1].name).toBe('University School Of Nashville');
			expect(res.body.chapters[1].permission).toBe('dashboard');
		});
	});

	describe('GET /user/chapters/byTourn/{tournId}/mySchools', () => {
		it('User has no school in an unexpected tournament', async () => {
			const res = await request(server)
				.get(`/v1/user/chapters/byTourn/29807/mySchools`)
				.set('Accept', 'application/json')
				.asPerson(tournUserkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body).toMatchSchema(z.array(MySchoolSchema));
			expect(res.body).toHaveLength(0);
		});
		it('User has a school in an expected tournament by permission', async () => {
			const res = await request(server)
				.get(`/v1/user/chapters/byTourn/${testUserChapterPerm.tourn}/mySchools`)
				.set('Accept', 'application/json')
				.asPerson(tournUserkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body).toMatchSchema(z.array(MySchoolSchema));
			expect(res.body).toHaveLength(1);
			expect(res.body[0].id).toBe(testUserChapterPerm.school);
			expect(res.body[0].students).toHaveLength(1);
		});
		it('User has a school in an expected tournament by contact status', async () => {
			const res = await request(server)
				.get(`/v1/user/chapters/byTourn/${testUserSchoolContact.tourn}/mySchools`)
				.set('Accept', 'application/json')
				.asPerson(tournUserkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body).toMatchSchema(z.array(MySchoolSchema));
			expect(res.body).toHaveLength(1);
			expect(res.body[0].chapter).toBe(testUserSchoolContact.chapter);
			expect(res.body[0].id).toBe(testUserSchoolContact.school);
		});
	});

	describe('GET /user/chapters/byTourn/{tournId}/nonSchools', () => {
		it('Schools not in a tournament are delivered correctly', async () => {
			const res = await request(server)
				.get(`/v1/user/chapters/byTourn/${testUserSchoolContact.tourn}/nonSchools`)
				.set('Accept', 'application/json')
				.asPerson(tournUserkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res.body).toMatchSchema(z.array(NonTournChapterSchema));
			expect(res.body).toHaveLength(1);
			expect(res.body[0].id).toBe(testUserChapterPerm.chapter);
		});
	});
});