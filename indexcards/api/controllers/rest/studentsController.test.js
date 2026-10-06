import { createContext } from '../../../tests/httpMocks.js';
import * as controller from './studentsController.js';
import studentRepo from '../../repos/studentRepo.js';
import personRepo from '../../repos/personRepo.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import logger from '../../helpers/logger.js';

describe('studentsController', () => {
	describe('unlinkedSearch', () => {
		it('returns mapped student results and updates settings for non-admin actor', async () => {
			vi.spyOn(changeLogRepo, 'createChangeLog').mockResolvedValue({});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({
				id: 10,
				settings: {
					student_search_count: 0,
				},
			});
			const updatePersonSpy = vi.spyOn(personRepo, 'updatePerson').mockResolvedValue(undefined);
			vi.spyOn(studentRepo, 'unlinkedSearch').mockResolvedValue([
				{
					id: 101,
					first: 'Test',
					middle: 'Q',
					last: 'Student',
					chapter_name: 'Lincoln',
					chapter_state: 'NE',
					tourn_count: 2,
				},
			]);

			const { req, res } = createContext({
				query: { first: 'Te', last: 'St' },
				person: { id: 10, site_admin: false },
				session: { id: 88, person: 10, su: null },
			});

			await controller.unlinkedSearch(req, res);

			expect(personRepo.getPerson).toHaveBeenCalledWith(expect.any(Object), 10, {
				settings: ['last_student_search', 'student_search_count'],
			});
			expect(updatePersonSpy).toHaveBeenCalledWith(expect.any(Object), 10,{ settings: {
				student_search_count: 1,
				last_student_search: expect.any(Date),
			}});
			expect(studentRepo.unlinkedSearch).toHaveBeenCalledWith(expect.any(Object), { first: 'Te', last: 'St' }, expect.any(Object));
			expect(res.body).toEqual([
				{
					id: 101,
					first: 'Test',
					middle: 'Q',
					last: 'Student',
					gradYear: null,
					Chapter: {
						name: 'Lincoln',
						state: 'NE',
					},
					tournCount: 2,
				},
			]);
		});

		it('returns 429 and skips search when person exceeds 24h limit', async () => {
			vi.spyOn(changeLogRepo, 'createChangeLog').mockResolvedValue({});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({
				id: 10,
				settings: {
					last_student_search: new Date(),
					student_search_count: 10,
				},
			});
			const updatePersonSpy = vi.spyOn(personRepo, 'updatePerson').mockResolvedValue(undefined);
			const unlinkedSearchSpy = vi.spyOn(studentRepo, 'unlinkedSearch').mockResolvedValue([]);

			const { req, res } = createContext({
				query: { first: 'Te', last: 'St' },
				person: { id: 10, site_admin: false },
				session: { id: 90, person: 10, su: null },
			});

			await controller.unlinkedSearch(req, res);

			expect(res).toBeProblemResponse(429);
			expect(unlinkedSearchSpy).not.toHaveBeenCalled();
			expect(updatePersonSpy).not.toHaveBeenCalled();
		});

		it('logs rich student-search description with su email and session id', async () => {
			const createChangeLogSpy = vi.spyOn(changeLogRepo, 'createChangeLog').mockResolvedValue({});
			vi.spyOn(studentRepo, 'unlinkedSearch').mockResolvedValue([]);
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({
				id: 11,
				settings: {
					student_search_count: 0,
				},
			});
			vi.spyOn(personRepo, 'updatePerson').mockResolvedValue(undefined);

			const { req, res } = createContext({
				query: { first: 'Ada', last: 'Lovelace' },
				person: { id: 11, site_admin: false },
				session: {
					id: 1234,
					person: 11,
					su: 45,
					Su: { email: 'admin@example.com' },
				},
			});

			await controller.unlinkedSearch(req, res);
			await Promise.resolve();

			expect(createChangeLogSpy).toHaveBeenCalledWith(expect.any(Object), {
				tag: 'student_search',
				person: 45,
				description: 'Searched for student records Ada Lovelace while logged in as admin@example.com from session ID 1234',
			});
		});

		it('logs an error when change log save fails', async () => {
			const logError = new Error('change log write failed');
			vi.spyOn(changeLogRepo, 'createChangeLog').mockRejectedValue(logError);
			const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => { });
			vi.spyOn(studentRepo, 'unlinkedSearch').mockResolvedValue([]);

			const { req, res } = createContext({
				query: { first: 'Test', last: 'User' },
				person: { id: 12, site_admin: true },
				session: { id: 222, person: 12, su: null },
			});

			await controller.unlinkedSearch(req, res);
			await Promise.resolve();

			expect(loggerErrorSpy).toHaveBeenCalledWith(
				'Failed to log student search usage to changeLog:',
				logError
			);
			expect(res.statusCode).toBe(200);
		});
		it('defaults to the users first and last on no params', async () => {
			vi.spyOn(changeLogRepo, 'createChangeLog').mockResolvedValue({});
			vi.spyOn(personRepo, 'getPerson').mockResolvedValue({
				id: 10,
				settings: {
					student_search_count: 0,
				},
			});
			const updatePersonSpy = vi.spyOn(personRepo, 'updatePerson').mockResolvedValue(undefined);
			vi.spyOn(studentRepo, 'unlinkedSearch').mockResolvedValue([
				{
					id: 101,
					first: 'Test',
					middle: 'Q',
					last: 'Student',
					chapter_name: 'Lincoln',
					chapter_state: 'NE',
					tourn_count: 2,
				},
			]);

			const { req, res } = createContext({
				query: {},
				person: {
					id: 10,
					first: 'Test',
					last: 'Student',
					site_admin: false,
				},
				session: { id: 88, person: 10, su: null },
			});

			await controller.unlinkedSearch(req, res);

			expect(personRepo.getPerson).toHaveBeenCalledWith(expect.any(Object), 10, {
				settings: ['last_student_search', 'student_search_count'],
			});
			expect(updatePersonSpy).toHaveBeenCalledWith(expect.any(Object), 10, { settings: {
				student_search_count: 1,
				last_student_search: expect.any(Date),
			}});
			expect(studentRepo.unlinkedSearch).toHaveBeenCalledWith(expect.any(Object), { first: 'Test', last: 'Student' }, expect.any(Object));
			expect(res.body).toEqual([
				{
					id: 101,
					first: 'Test',
					middle: 'Q',
					last: 'Student',
					gradYear: null,
					Chapter: {
						name: 'Lincoln',
						state: 'NE',
					},
					tournCount: 2,
				},
			]);

		});
	});
});
