import personRepo from '../../repos/personRepo.js';
import { createContext } from '../../../tests/httpMocks.js';
import paradigmsController from './paradigmsController.js';
import * as judgeRepo from '../../repos/judgeRepo.js';
import * as judgeRecordsService from '../../services/results/judgeRecords.js';
import { db } from '../../data/database.js';
import { JudgeRecordSchema, ParadigmDetailsSchema } from '@tabroom/types';

function mockCertificationQuery(rows) {
	const query = {
		innerJoin: vi.fn(() => query),
		select: vi.fn(() => query),
		where: vi.fn(() => query),
		execute: vi.fn().mockResolvedValue(rows),
	};

	vi.spyOn(db, 'selectFrom').mockReturnValue(query);

	return query;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('paradigmsController', () => {
	describe('getParadigms', async () => {
		it('should return a list of paradigms', async () => {
			vi.spyOn(personRepo, 'personSearch').mockResolvedValue([
				{ id: 1, first: 'Test', middle: null, last: 'Paradigm' },
			]);
			vi.spyOn(judgeRepo, 'getJudgesForPersons').mockResolvedValue({
				1: [
					{
						id: 10,
						person: 1,
						created_at: new Date().toISOString(),
						School: { id: 2, name: 'School 1' },
					},
				],
			});
			const { req, res } = createContext({
				valid: {query: {}},
			});
			await paradigmsController.getParadigms(req, res);
			expect(res).not.toBeProblemResponse();
			expect(personRepo.personSearch).toHaveBeenCalledWith(db, '', {
				excludeBanned: true,
				excludeUnconfirmedEmail: true,
				hasValidParadigm: true,
				hasJudged: true,
				limit: 50,
				offset: 0,
			});
			expect(judgeRepo.getJudgesForPersons).toHaveBeenCalledWith(db, [1]);
			expect(res.body).toEqual([
				{
					id: 1,
					name: 'Test Paradigm',
					tournJudged: 1,
					schools: [{ id: 2, name: 'School 1' }],
				},
			]);
		});
		it('does not return schools older than 5 years', async () => {
			const fiveYearsAgo = new Date();
			fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
			vi.spyOn(personRepo, 'personSearch').mockResolvedValue([
				{ id: 1, first: 'Test', middle: null, last: 'Paradigm' },
			]);
			vi.spyOn(judgeRepo, 'getJudgesForPersons').mockResolvedValue({
				1: [
					{
						id: 11,
						person: 1,
						created_at: new Date(fiveYearsAgo.getTime() - 100).toISOString(),
						School: { id: 1, name: 'gt5Years' },
					},
					{
						id: 12,
						person: 1,
						created_at: new Date(fiveYearsAgo.getTime() + 100).toISOString(),
						School: { id: 2, name: 'lt5Years' },
					},
				],
			});
			const { req, res } = createContext({
				valid: {query: {}},
			});
			await paradigmsController.getParadigms(req, res);
			expect(res).not.toBeProblemResponse();
			const paradigm = res.body.find(p => p.id === 1);
			expect(paradigm).toBeDefined();
			expect(paradigm.schools).toHaveLength(1);
			expect(paradigm.schools[0].name).toBe('lt5Years');

		});
	});
	describe('getParadigmByPersonId', async () => {
		it('should return paradigms for a given personId', async () => {
			mockCertificationQuery([
				{
					id: 1,
					person: 1,
					quiz: 1,
					pending: false,
					approved_by: null,
					updated_at: '2026-01-01T00:00:00.000Z',
					quizId: 1,
					tag: null,
					label: 'Test Quiz',
					description: 'A test quiz',
					badge_description: 'A test badge description',
					badge: 'badge.png',
					badge_link: 'http://example.com/badge',
					circuit: null,
				},
			]);

			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({
				id: 1,
				first: 'Mark',
				middle: null,
				last: 'Tester',
				settings: {
					paradigm: 'test',
				},
				settingsTimestamps:{
					paradigm: {
						updatedAt: '2026-01-01T00:00:00.000Z',
					},
				},
			});
			const { req, res } = createContext({
				valid: {params: { personId: 1 }},
			});
			await paradigmsController.getParadigmByPersonId(req, res);
			expect(res).not.toBeProblemResponse();
			expect(db.selectFrom).toHaveBeenCalledWith('person_quiz');
			expect(res.body).toMatchSchema(ParadigmDetailsSchema);
		});
		it('should return a 404 if personId does not exist', async () => {
			const selectFromSpy = vi.spyOn(db, 'selectFrom');
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue(null);
			const { req, res } = createContext({
				valid: {params: { personId: 999 }},
			});
			await paradigmsController.getParadigmByPersonId(req, res);
			expect(res).toBeProblemResponse(404);
			expect(selectFromSpy).not.toHaveBeenCalled();
		});
	});

	describe('getJudgingRecord', () => {
		it('returns records from the judgeRecord service', async () => {
			const mockRecord = [
				{
					Tourn: { id: 1, name: 'Example Tourn' },
					roundDate: '2026-04-01T00:00:00.000Z',
					roundLabel: 'R1',
					eventAbbr: 'PF',
					affTeam: 'AFF1',
					affLabel: 'Aff',
					negTeam: 'NEG1',
					negLabel: 'Neg',
					vote: 'Aff',
					panelVote: 'Aff',
					record: '1-0',
				},
			];

			vi.spyOn(judgeRecordsService, 'judgeRecord').mockResolvedValue(mockRecord);

			const { req, res } = createContext({
				valid: {
					params: { personId: 1 },
				},
			});

			await paradigmsController.getJudgingRecord(req, res);
			expect(judgeRecordsService.judgeRecord).toHaveBeenCalledWith(1);
			expect(res.body).toEqual(mockRecord);

			// Validate each element in the response array
			for (const item of res.body) {
				expect(item).toMatchSchema(JudgeRecordSchema);
			}
		});
	});
});