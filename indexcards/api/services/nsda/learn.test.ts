import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import logger from '../../helpers/logger.js';
import { NSDAError } from './fetchNSDA.js';
import { getLearnCompletions, LearnCompletionSchema } from './learn.js';

// The real NSDAError; only the request itself is faked
const { fetchNSDA } = vi.hoisted(() => ({ fetchNSDA: vi.fn() }));
vi.mock('./fetchNSDA.js', async (importOriginal) => ({
	...await importOriginal<typeof import('./fetchNSDA.js')>(),
	fetchNSDA,
}));

// A row as the Learn site sends it: person_id is text, user_id the same id as a number
const row = (id: number, email: string, completed = '2026-10-02 14:05:11') => ({ user_id: id, person_id: String(id), email, name: 'Dana Reyes', completed });

describe('getLearnCompletions', () => {
	beforeEach(() => {
		fetchNSDA.mockReset();
		vi.spyOn(logger, 'warn').mockImplementation(() => logger);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('asks for the course and returns each completion in the schema\'s shape', async () => {
		fetchNSDA.mockResolvedValue([row(5001, 'dana@school.org'), row(5002, ' Sam@School.org ')]);

		const completions = await getLearnCompletions(117271);

		expect(fetchNSDA).toHaveBeenCalledExactlyOnceWith('/learn/courses/117271');
		expect(completions).toEqual([
			{ person_id: 5001, email: 'dana@school.org', name: 'Dana Reyes', completed: '2026-10-02 14:05:11' },
			{ person_id: 5002, email: 'Sam@School.org', name: 'Dana Reyes', completed: '2026-10-02 14:05:11' },
		]);
		expect(completions).toMatchSchema(LearnCompletionSchema.array());
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('takes an empty list as a course nobody has completed', async () => {
		fetchNSDA.mockResolvedValue([]);

		await expect(getLearnCompletions(117271)).resolves.toEqual([]);
	});

	it('leaves out rows missing an id, an email, or a date, and warns with the count', async () => {
		fetchNSDA.mockResolvedValue([
			row(5001, 'dana@school.org'),
			row(5002, ''),
			{ ...row(5003, 'lee@school.org'), person_id: null },
			{ ...row(5004, 'ari@school.org'), completed: null },
			null,
		]);

		const completions = await getLearnCompletions(117271);

		expect(completions.map((completion) => completion.person_id)).toEqual([5001]);
		expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
			'Left out 4 of 5 NSDA Learn completions for course 117271 that had no id, email, or completion date',
			{ 'event.name': 'nsda.learn.completions.skipped', course: 117271, skipped: 4 },
		);
	});

	it('leaves out rows whose completion date does not read as Learn\'s date and time', async () => {
		fetchNSDA.mockResolvedValue([
			row(5001, 'dana@school.org'),
			row(5002, 'sam@school.org', '0000-00-00 00:00:00'),
			row(5003, 'lee@school.org', '2026-05-01T12:00:00Z'),
			row(5004, 'ari@school.org', 'yesterday'),
		]);

		expect((await getLearnCompletions(117271)).map((completion) => completion.person_id)).toEqual([5001]);
	});

	it('passes on the reason a request failed', async () => {
		fetchNSDA.mockRejectedValue(new NSDAError('The NSDA API answered GET /learn/courses/117271 with 503 Service Unavailable', { status: 503 }));

		await expect(getLearnCompletions(117271)).rejects.toThrow('The NSDA API answered GET /learn/courses/117271 with 503 Service Unavailable');
	});

	it('throws when the answer is not a list, as when the Learn site errors behind a 200', async () => {
		fetchNSDA.mockResolvedValue({ code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' });
		await expect(getLearnCompletions(117271)).rejects.toThrow('NSDA Learn did not return a list of completions for course 117271');

		fetchNSDA.mockResolvedValue(null);
		await expect(getLearnCompletions(117271)).rejects.toThrow('NSDA Learn did not return a list of completions for course 117271');
	});

	it('throws when no row is usable, so a renamed field is not read as an empty course', async () => {
		fetchNSDA.mockResolvedValue([{ user_id: 5001, email: 'dana@school.org' }, { user_id: 5002, email: 'sam@school.org' }]);

		await expect(getLearnCompletions(117271)).rejects.toThrow('None of the 2 rows NSDA Learn returned for course 117271 had an id, an email, and a completion date');
	});
});
