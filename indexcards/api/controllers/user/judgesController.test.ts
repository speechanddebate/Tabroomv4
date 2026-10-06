import con from './judgesController.js';
import judgeRepo from '../../repos/judgeRepo.js';
import tabroomRepo from '../../repos/tabroomRepo.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import { UnlinkedJudgeSchema } from '@tabroom/types';
import { createPersonContext } from '../../../tests/httpMocks.js';
import { db } from '../../data/database.js';
import logger from '../../helpers/logger.js';
import factories from '../../../tests/factories/index.js';
import z from 'zod';
import type { TabroomSetting } from '../../data/schema.js';
import type { Selectable } from 'kysely';

vi.mock('../../repos/tabroomRepo.js', () => ({
	default: {
		getSettings: vi.fn(),
	},
}));
vi.spyOn(logger, 'debug');
vi.spyOn(changeLogRepo, 'createChangeLog');

type Person = Awaited<ReturnType<typeof factories.person.create>>;

let person!: Person;
describe('judgesController', () => {
	beforeAll(async () => {
		person = await factories.person.create();
	});
	describe('linkRequests', () => {
		it('should return linked judges and chapter judges for the user', async () => {
			const Judge1 = await factories.judge.create({ person_request: person.id });
			const Judge2 = await factories.judge.create({ person_request: person.id });
			const ChapterJudge1 = await factories.chapterJudge.create({ person_request: person.id });

			// Mock request and response
			const {req, res } = createPersonContext(person,{});

			// Call the controller function
			await con.linkRequests(req, res);

			// Assertions
			expect(res).not.toBeProblemResponse();
			expect(res.body).toContainEqual(expect.objectContaining({ id: Judge1.id }));
			expect(res.body).toContainEqual(expect.objectContaining({ id: Judge2.id }));
			expect(res.body).toContainEqual(expect.objectContaining({ id: ChapterJudge1.id }));
			expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
		});
	});
	describe('claimRequest', () => {
		it('should return 400 if both judgeId and chapterJudgeId are provided', async () => {
			const judge = await factories.judge.create();
			const chapterJudge = await factories.chapterJudge.create();
	
			const { req, res } = createPersonContext(person, {
				query: {
					judgeId: judge.id,
					chapterJudgeId: chapterJudge.id,
				},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).toBeProblemResponse(400);
		});
	
		it('should return 400 if neither judgeId nor chapterJudgeId are provided', async () => {
			const { req, res } = createPersonContext(person, {
				query: {},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).toBeProblemResponse(400);
		});
	
		it('should return 400 if judgeId is invalid', async () => {
			const { req, res } = createPersonContext(person, {
				query: {
					judgeId: 999999999,
				},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).toBeProblemResponse(400);
		});
	
		it('should return 400 if judge has no category', async () => {
			// If category is nullable in the DB:
			const judge = await factories.judge.create({
				category: null,
			});
	
			const { req, res } = createPersonContext(person, {
				query: {
					judgeId: judge.id,
				},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).toBeProblemResponse(400);
		});
	
		it('should return 400 if user is already linked to another judge in the same category', async () => {
			const category = await factories.category.create();
	
			await factories.judge.create({
				category: category.id,
				person: person.id,
			});
	
			const requestedJudge = await factories.judge.create({
				category: category.id,
			});
	
			const { req, res } = createPersonContext(person, {
				query: {
					judgeId: requestedJudge.id,
				},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).toBeProblemResponse(400);
		});
	
		it('should return 400 if user has already requested another judge in the same category', async () => {
			const category = await factories.category.create();
	
			await factories.judge.create({
				category: category.id,
				person_request: person.id,
			});
	
			const requestedJudge = await factories.judge.create({
				category: category.id,
			});
	
			const { req, res } = createPersonContext(person, {
				query: {
					judgeId: requestedJudge.id,
				},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).toBeProblemResponse(400);
		});
	
		it('should return 200 and update judge if valid judgeId is provided', async () => {
			const category = await factories.category.create();
	
			const Judge = await factories.judge.create({
				category: category.id,
			});
	
			const { req, res } = createPersonContext(person, {
				query: {
					judgeId: Judge.id,
				},
			});
	
			await con.claimRequest(req, res);
	
			expect(res).not.toBeProblemResponse();
			expect(res.status).toBeCalledWith(200);
	
			const updatedJudge = await judgeRepo.getJudge(db, Judge.id);
	
			expect(updatedJudge?.person_request).toBe(person.id);
		});
	});
	describe('updateParadigm', () => {
		let { req, res } = {} as ReturnType<typeof createPersonContext>;
		beforeEach(() => {
			({ req, res } = createPersonContext(person, {}));
			vi.mocked(tabroomRepo.getSettings).mockResolvedValue([
				{ id: 1,tag: 'paradigm_word_limit', value: '100' } as Selectable<TabroomSetting>,
			]);
		});
		it('should return 400 if paradigm exceeds word limit', async () => {
			req.body = { paradigm: 'word '.repeat(101) };
			await con.updateParadigm(req, res);
			expect(res).toBeProblemResponse(400);
		});
		it('should return 403 if persons email is unconfirmed', async () => {
			const reqOverride = { body: { paradigm: 'word '.repeat(50) } };
			const unconfirmedPerson = await factories.person.create({ settings: { email_unconfirmed: 1 } });
			const { req: req2, res: res2 } = createPersonContext(unconfirmedPerson, reqOverride);
			//vi.mocked(personRepo.getPerson).mockResolvedValue({ id: 123, settings: { email_unconfirmed: true } });
			await con.updateParadigm(req2, res2);
			expect(res2).toBeProblemResponse(403);
		});
		it('does not fail if no word limit is set', async () => {
			req.body = { paradigm: 'word '.repeat(200) };
			vi.mocked(tabroomRepo.getSettings).mockResolvedValue([]);
			await con.updateParadigm(req, res);
			expect(res).not.toBeProblemResponse();
			expect(logger.debug).toHaveBeenCalled();
		});
		it('should return 400 if paradigm contains profanity', async () => {
			req.body = { paradigm: 'word '.repeat(50) + ' shit' };
			await con.updateParadigm(req, res);
			expect(res).toBeProblemResponse(400);
		});
		it('saves the paradigm if it meets all requirements', async () => {
			req.body = { paradigm: 'word '.repeat(50) };
			await con.updateParadigm(req, res);
			expect(res).not.toBeProblemResponse();
			expect(changeLogRepo.createChangeLog).toHaveBeenCalled();
		});
	});
});