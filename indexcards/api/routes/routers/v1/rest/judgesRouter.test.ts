import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import z from 'zod';
import { UnlinkedJudgeSchema } from '@tabroom/types';

describe('GET /rest/judges/unlinked/search', () => {
	let userkey: string;
	let first: string;
	let last: string;
	let chapterJudgeId: number;
	let cjFirst: string;
	let cjLast: string;

	beforeAll(async () => {
		const Judge = await factories.judge.create();
		first = Judge.first!;
		last = Judge.last!;

		const ChapterJudge = await factories.chapterJudge.create();
		chapterJudgeId = ChapterJudge.id;
		cjFirst = ChapterJudge.first!;
		cjLast = ChapterJudge.last!;

		({ userkey } = await factories.session.create({
			Person: {
				first,
				last,
			},
		}));
	});

	it('returns 401 without authentication', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: first, last: last })
      .set('Accept', 'application/json')
      .expect(401);

		expect(res).toBeProblemResponse(401);
	});

	it('returns a list of matching unlinked judges', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: first, last: last })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect('Content-Type', /json/)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThanOrEqual(1);
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
	});

	it('returns an empty list when no judges match', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: 'ZZZNoMatch', last: 'ZZZNoMatch' })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect('Content-Type', /json/)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(res.body).toEqual([]);
	});

	it('uses users name to preform search with no params', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThanOrEqual(1);
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
	});

	it('returns chapter judges in results with correct type', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: cjFirst, last: cjLast })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
		const found = res.body.find((r: { id: number }) => r.id === chapterJudgeId);
		expect(found).toBeDefined();
		expect(found.type).toBe('chapter_judge');
	});

	it('returns both judge and chapter_judge types in a combined search', async () => {
		const ChapterJudge2 = await factories.chapterJudge.create({
			first,
			last,
		});
		const cjId2 = ChapterJudge2.id;

		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: ChapterJudge2.first, last: ChapterJudge2.last })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
		const types = res.body.map((r: { type: string }) => r.type);
		expect(types).toContain('judge');
		expect(types).toContain('chapter_judge');
		const cjResult = res.body.find((r: { id: number }) => r.id === cjId2);
		expect(cjResult).toBeDefined();
		expect(cjResult.schoolName).toBeDefined();
	});

});

