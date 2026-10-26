import factories from '../../../../../../tests/factories/index.js';
import request from 'supertest';
import server from '../../../../../../app.js';
import z from 'zod';
import { ClaimResponseSchema, JudgeHistoryPageSchema, JudgeTournHistorySchema, UnlinkedJudgeSchema, UserParadigmSchema, JudgeLiveDocSchema } from '@tabroom/types';
import personRepo from '../../../../../repos/personRepo.js';
import { db } from '../../../../../../api/data/database.js';
import chapterJudgeRepo from '../../../../../repos/chapterJudgeRepo.js';
import judgeRepo from '../../../../../repos/judgeRepo.js';

describe('judgesRouter', () => {
	let personId : number;
	let userkey: string;
	beforeAll(async () => {
		({ id: personId } = await factories.person.create());
		({ userkey } = await factories.session.create({ person: personId }));
	});
	describe('GET /user/judges/linkRequests', () => {
		it('should return the link requests for the logged in user', async () => {
			const Chapter = await factories.chapter.create();
			const CJ = await factories.chapterJudge.create({
				person_request: personId,
				chapter: Chapter.id,
			});
			const Judge = await factories.judge.create({
				person_request: personId,
				category: (await factories.category.create()).id,
			});

			const res = await request(server)
				.get('/v1/user/judges/linkRequests')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);

			expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema))
			expect(res.body).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: Judge.id,
						type: 'judge',
						first: Judge.first,
						last: Judge.last,
					}),
					expect.objectContaining({
						id: CJ.id,
						type: 'chapter_judge',
						first: CJ.first,
						last: CJ.last,
					}),
				])
			);
		});
	});
	describe("POST /user/judges/claim", () => {
		it('should allow a user to claim a chapter judge', async () => {
			//setup - create a chapter judge with no person_request
			const Chapter = await factories.chapter.create();
			const ChapterJudge = await factories.chapterJudge.create({
				person_request: null,
				chapter: Chapter.id,
			});
			//make the request to claim the chapter judge
			const res = await request(server)
				.post('/v1/user/judges/claim')
				.query({ chapterJudgeId: ChapterJudge.id })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(res.body).toMatchSchema(ClaimResponseSchema);
			//assert that the chapter judge's person_request is updated and that an email was sent to the chapter email with the correct content
			const updatedChapterJudge = await chapterJudgeRepo.getChapterJudge(db,ChapterJudge.id);
			expect(updatedChapterJudge?.person_request).toBe(personId);
		});
		it('should auto-approve a claim request if the user is a chapter admin', async () => {
			//setup - create a chapter judge with no person_request
			const Chapter = await factories.chapter.create();
			const ChapterJudge = await factories.chapterJudge.create({
				person_request: null,
				chapter: Chapter.id,
			});
			await factories.permission.create({ person: personId, chapter: Chapter.id, tag: 'chapter' }); //give the user admin permissions for the chapter so they can receive the notification email
			//make the request to claim the chapter judge
			const res = await request(server)
				.post('/v1/user/judges/claim')
				.query({ chapterJudgeId: ChapterJudge.id })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(res.body).toMatchSchema(ClaimResponseSchema);
			//assert that the chapter judge's person_request is updated and that an email was sent to the chapter email with the correct content
			const updatedChapterJudge = await chapterJudgeRepo.getChapterJudge(db,ChapterJudge.id);
			expect(updatedChapterJudge?.person).toBe(personId);
		});
		it('should allow a user to claim a judge', async () => {
			const Cat = await factories.category.create();
			const Judge = await factories.judge.create({ category: Cat.id });

			const res = await request(server)
				.post('/v1/user/judges/claim')
				.query({ judgeId: Judge.id })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(res.body).toMatchSchema(ClaimResponseSchema);

			const updatedJudge = await judgeRepo.getJudge(db, Judge.id);
			expect(updatedJudge?.person_request).toBe(personId);
			//setup - create a judge with no person_request
			//make the request to claim the judge
			//assert that the judge's person_request is updated and that an email was sent to the chapter email with the correct content
		});
	});
	describe("GET /user/judges/history", () => {
		it('should return the judge history for the logged in user', async () => {
			const Tourn = await factories.tourn.create(); // start is past by default
			const Category = await factories.category.create({ tourn: Tourn.id });
			const Judge = await factories.judge.create({ person: personId, category: Category.id });

			// Create event → round → panel → ballot chain
			const Event = await factories.event.create({ category: Category.id });
			const Round = await factories.round.create({ event: Event.id, published: 1 });
			const Panel = await factories.panel.create({ round: Round.id });
			await factories.ballot.create({ panel: Panel.id, judge:Judge.id });
			
			const res = await request(server)
				.get('/v1/user/judges/history')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(res.body).toMatchSchema(JudgeHistoryPageSchema);
		});

		it('returns tournament and weekend dates as UTC ISO strings with the tourn tz', async () => {
			const { id: person } = await factories.person.create();
			const { userkey: key } = await factories.session.create({ person });
			const start = new Date('2025-03-08T05:30:00Z');
			const Tourn = await factories.tourn.create({ tz: 'America/Chicago', start, end: new Date('2025-03-10T04:00:00Z') });
			const Category = await factories.category.create({ tourn: Tourn.id });
			const Judge = await factories.judge.create({ person, category: Category.id });
			const weekend = await factories.weekend.create({ tourn: Tourn.id, start });
			await factories.event.create({ category: Category.id, settings: { weekend: weekend.id } });

			const res = await request(server)
				.get('/v1/user/judges/history')
				.set('Accept', 'application/json')
				.asPerson(key)
				.expect(200);

			expect(res.body).toMatchSchema(JudgeHistoryPageSchema);
			expect(res.body.items).toHaveLength(1);
			expect(res.body.items[0].id).toBe(Judge.id);
			expect(res.body.items[0].Tourn.start).toBe(start.toISOString());
			expect(res.body.items[0].Tourn.tz).toBe('America/Chicago');
			expect(res.body.items[0].Weekend.start).toBe(weekend.start.toISOString());
			expect(res.body.items[0].Weekend.end).toBe(weekend.end.toISOString());
		});

		it('returns one page of history with the total', async () => {
			const { id: person } = await factories.person.create();
			const { userkey: key } = await factories.session.create({ person });
			for (let i = 0; i < 3; i++) {
				const Tourn = await factories.tourn.create();
				const Category = await factories.category.create({ tourn: Tourn.id });
				await factories.judge.create({ person, category: Category.id });
			}

			const res = await request(server)
				.get('/v1/user/judges/history')
				.query({ limit: 2, offset: 0 })
				.set('Accept', 'application/json')
				.asPerson(key)
				.expect(200);

			expect(res.body).toMatchSchema(JudgeHistoryPageSchema);
			expect(res.body.items).toHaveLength(2);
			expect(res.body.total).toBe(3);
		});

		it('rejects a limit of zero', async () => {
			const res = await request(server)
				.get('/v1/user/judges/history')
				.query({ limit: 0 })
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(400);
			expect(res).toBeProblemResponse(400);
		});
	});
	describe("GET /user/judges/history/:tournId", () => {
		const DAY = 24 * 60 * 60 * 1000;
		const finishedTourn = () => factories.tourn.create({
			start: new Date(Date.now() - 10 * DAY),
			end: new Date(Date.now() - 8 * DAY),
		});

		it("returns the judge's records with their assigned sections", async () => {
			const Tourn = await finishedTourn();
			const Category = await factories.category.create({ tourn: Tourn.id, settings: { no_codes: 1 } });
			const Judge = await factories.judge.create({ person: personId, category: Category.id, code: '7B' });
			const Event = await factories.event.create({ category: Category.id, type: 'debate', settings: { aff_label: 'Pro', neg_label: 'Con' } });
			const Round = await factories.round.create({ event: Event.id, published: 1, post_primary: 0 });
			const Panel = await factories.panel.create({ round: Round.id });
			const Entry = await factories.entry.create({ event: Event.id, tourn: Tourn.id, code: '101' });
			await factories.ballot.create({ panel: Panel.id, judge: Judge.id, entry: Entry.id, side: 1 });

			const res = await request(server)
				.get(`/v1/user/judges/history/${Tourn.id}`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);

			expect(res.body).toMatchSchema(JudgeTournHistorySchema);
			expect(res.body.Tourn).toMatchObject({ id: Tourn.id, start: Tourn.start?.toISOString(), tz: Tourn.tz });
			expect(res.body.Judges).toHaveLength(1);
			expect(res.body.Judges[0]).toMatchObject({ id: Judge.id, code: null, roundsJudged: 1, flightsJudged: 1 });
			expect(res.body.Judges[0].Panels).toHaveLength(1);
			expect(res.body.Judges[0].Panels[0].Entries[0]).toMatchObject({ id: Entry.id, code: '101', side: 'Pro' });
		});

		it("returns the judge's entered results with speaker points and the panel winner", async () => {
			const Tourn = await finishedTourn();
			const Category = await factories.category.create({ tourn: Tourn.id });
			const Judge = await factories.judge.create({ person: personId, category: Category.id });
			const Event = await factories.event.create({ category: Category.id, type: 'debate' });
			const aff = await factories.entry.create({ event: Event.id, tourn: Tourn.id, code: '101', name: 'Northview AB', students: [(await factories.student.create({ last: 'Smith' })).id] });
			const neg = await factories.entry.create({ event: Event.id, tourn: Tourn.id, code: '202', name: 'Southview CD' });

			// A prelim this judge scored with speaker points, and an elim the panel split 2-1 for the aff
			const prelimRound = await factories.round.create({ event: Event.id, name: 1, type: 'prelim', published: 1, post_primary: 3 });
			const prelim = await factories.panel.create({ round: prelimRound.id });
			const affBallot = await factories.ballot.create({ panel: prelim.id, judge: Judge.id, entry: aff.id, side: 1 });
			await factories.ballot.create({ panel: prelim.id, judge: Judge.id, entry: neg.id, side: 2 });
			await factories.score.create({ ballot: affBallot.id, tag: 'winloss', value: 1 });
			const [smith] = await db.selectFrom('entry_student').select('student').where('entry', '=', aff.id).execute();
			await factories.score.create({ ballot: affBallot.id, tag: 'point', value: 28.5, student: smith.student });

			const elimRound = await factories.round.create({ event: Event.id, name: 2, type: 'elim', published: 1, post_primary: 3 });
			const elim = await factories.panel.create({ round: elimRound.id });
			const otherJudges = [await factories.judge.create({ category: Category.id }), await factories.judge.create({ category: Category.id })];
			for (const [judgeId, affWins] of [[Judge.id, 1], [otherJudges[0].id, 1], [otherJudges[1].id, 0]] as const) {
				const a = await factories.ballot.create({ panel: elim.id, judge: judgeId, entry: aff.id, side: 1 });
				const n = await factories.ballot.create({ panel: elim.id, judge: judgeId, entry: neg.id, side: 2 });
				await factories.score.create({ ballot: a.id, tag: 'winloss', value: affWins });
				await factories.score.create({ ballot: n.id, tag: 'winloss', value: affWins ? 0 : 1 });
			}

			const res = await request(server)
				.get(`/v1/user/judges/history/${Tourn.id}`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);

			expect(res.body).toMatchSchema(JudgeTournHistorySchema);
			const [record] = res.body.Judges;
			expect(record.Panels).toHaveLength(0);
			expect(record.Results.map((r: { Round: { name: number } }) => r.Round.name)).toEqual([1, 2]);

			const [prelimResult, elimResult] = record.Results;
			expect(prelimResult.Entries[0]).toMatchObject({ code: '101', side: 'Aff', Scores: { winloss: 'W', rank: null, point: null } });
			expect(prelimResult.Entries[0].Students).toEqual([{ id: smith.student, last: 'Smith', Scores: { winloss: null, rank: null, point: 28.5 } }]);
			expect(prelimResult.Winner).toBeNull();

			expect(elimResult.Entries.map((e: { Scores: { winloss: string } }) => e.Scores.winloss)).toEqual(['W', 'L']);
			expect(elimResult.Winner).toEqual({ entry: aff.id, code: '101', name: 'Northview AB', record: '2-1' });
		});

		it('is not found for a tournament the person did not judge', async () => {
			const Tourn = await finishedTourn();
			const res = await request(server)
				.get(`/v1/user/judges/history/${Tourn.id}`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(404);
				expect(res).toBeProblemResponse(404);
		});

		it('rejects a tournament id that is not a number', async () => {
			const res = await request(server)
				.get('/v1/user/judges/history/abc')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(400);
			expect(res).toBeProblemResponse(400);
		});
	});
	describe("GET /user/judges/paradigm", () => {
		it("should return the paradigm for a person", async () => {
			const Person = await factories.person.create({ settings: { paradigm: 'Initial paradigm' } });
			const { userkey } = await factories.session.create({ person: Person.id });
			const res = await request(server)
				.get('/v1/user/judges/paradigm')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(res.body).toMatchSchema(UserParadigmSchema);
			expect(res.body.paradigm).toBe('Initial paradigm');
		});
		it("returns 404 when the person has no paradigm", async () => {
			const Person = await factories.person.create();
			const { userkey } = await factories.session.create({ person: Person.id });
			const res = await request(server)
				.get('/v1/user/judges/paradigm')
				.set('Accept', 'application/json')
				.asPerson(userkey);
			expect(res).toBeProblemResponse(404);
		});
	});
	describe("POST /user/judges/paradigm", () => {
		it('should update the users paradigm', async () => {
			const Person = await factories.person.create();
			const { userkey } = await factories.session.create({ person: Person.id });
			const body: z.input<typeof UserParadigmSchema> = { paradigm: 'word '.repeat(50) };
			const res = await request(server)
				.post('/v1/user/judges/paradigm')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.send(body)
				.expect(204);
			expect(res).not.toBeProblemResponse();

			const updatedPerson = await personRepo.getPerson(db, Person.id,{ settings: ['paradigm']});
			expect(updatedPerson!.settings!.paradigm).toBe('word '.repeat(50));

			const newParadigm = await request(server)
				.get('/v1/user/judges/paradigm')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(newParadigm.body.paradigm).toBe('word '.repeat(50));
		});
	});
	describe("GET /user/judges/livedocs", () => {
		it('should return the live docs for the logged in user', async () => {
			const Tourn = await factories.tourn.create();
			const category = await factories.category.create({
				tourn: Tourn.id,
				settings: {
					livedoc_url: 'example.com',
					livedoc_caption: 'example',
				},
			});

			await factories.person.createJudge({ person: personId, Judge: { category: category.id } });
			const res = await request(server)
				.get('/v1/user/judges/livedocs')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);
			expect(res.body).toMatchSchema(z.array(JudgeLiveDocSchema));
			expect(res.body[0].url).toBe('example.com');
			expect(res.body[0].caption).toBe('example');
		});
	});
});
