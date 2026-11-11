import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import factories from '../../../../tests/factories/index.js';
import config from '../../../config.js';
import { db } from '../../../data/database.js';
import logger from '../../../helpers/logger.js';
import quizRepo from '../../../repos/quizRepo.js';
import { NSDAError } from '../../nsda/fetchNSDA.js';
import type { LearnCompletion } from '../../nsda/learn.js';
import { LEARN_APPROVER, learnCourseSyncSchedule, syncLearnByCourse, syncLearnCourses } from './learnCourseSync.js';

// Learn's answer and the NSDA member lookups are faked; everything else runs against the test database
const { getLearnCompletions, fetchNSDA } = vi.hoisted(() => ({ getLearnCompletions: vi.fn(), fetchNSDA: vi.fn() }));
vi.mock('../../nsda/learn.js', () => ({ getLearnCompletions }));
vi.mock('../../nsda/fetchNSDA.js', async (importOriginal) => ({
	...await importOriginal<typeof import('../../nsda/fetchNSDA.js')>(),
	fetchNSDA,
}));

let next = 880_000_000 + Math.floor(Math.random() * 1_000_000);
const nsdaId = () => next++;
const email = (name: string) => `${name}.${next++}@learn.example`;
const completion = (id: number, address: string): LearnCompletion => ({ person_id: id, email: address, name: 'Dana Reyes', completed: '2026-10-02 14:05:11' });

const rowsFor = (person: number, quiz: number) => db.selectFrom('person_quiz')
	.select(['id', 'completed', 'pending', 'approved_by', 'answers', 'updated_at'])
	.where('person', '=', person).where('quiz', '=', quiz).orderBy('id').execute();
const nsdaOf = async (person: number) => (await db.selectFrom('person').select('nsda').where('id', '=', person).executeTakeFirstOrThrow()).nsda;
const settingOf = async (person: number, tag: string) => (await db.selectFrom('person_setting').select('value').where('person', '=', person).where('tag', '=', tag).executeTakeFirst())?.value;
const linkLogs = async (person: number) => (await db.selectFrom('change_log').select('description').where('person', '=', person).where('tag', '=', 'link').execute()).map((row) => row.description);
const stored = async (tag: string) => JSON.parse((await db.selectFrom('tabroom_setting').select('value_text').where('tag', '=', tag).executeTakeFirst())?.value_text ?? 'null');

/** Runs one quiz's sync against what Learn is said to report */
async function sync(completions: LearnCompletion[]) {
	const Quiz = await factories.quiz.create({ nsda_course: 117271 });
	getLearnCompletions.mockResolvedValue(completions);
	const result = await syncLearnByCourse(Quiz);
	return { Quiz, result };
}

beforeEach(() => {
	getLearnCompletions.mockReset();
	// No member search finds anyone unless a test says so
	fetchNSDA.mockReset().mockResolvedValue([]);
	vi.spyOn(logger, 'info').mockImplementation(() => logger);
	vi.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('learn course sync job', () => {
	const jobs = { ...config.jobs.learnCourseSync };

	beforeAll(() => {
		Object.assign(config.jobs.learnCourseSync, { enabled: false });
	});

	afterAll(() => {
		Object.assign(config.jobs.learnCourseSync, jobs);
	});

	it('follows its config flag', () => {
		expect(learnCourseSyncSchedule.enabled()).toBe(false);

		config.jobs.learnCourseSync.enabled = true;
		expect(learnCourseSyncSchedule.enabled()).toBe(true);
		config.jobs.learnCourseSync.enabled = false;
	});
});

describe('syncLearnByCourse: updating the course', () => {
	it('adds an approved row for an account matched by NSDA id, second id, email, or second email', async () => {
		const ids = [nsdaId(), nsdaId(), nsdaId(), nsdaId()];
		const second = email('second');
		const ByMainId = await factories.person.create({ nsda: ids[0] });
		const BySecondId = await factories.person.create({ nsda: nsdaId(), settings: { nsda_id: String(ids[1]) } });
		const ByEmail = await factories.person.create({ nsda: ids[2] });
		const BySecondEmail = await factories.person.create({ nsda: ids[3], settings: { nsda_email: second } });

		const { Quiz, result } = await sync([
			completion(ids[0], email('learn')),
			completion(ids[1], email('learn')),
			completion(nsdaId(), ByEmail.email.toUpperCase()),
			completion(nsdaId(), second),
		]);

		expect(result).toMatchObject({ completions: 4, added: 4, approved: 0 });
		for (const Person of [ByMainId, BySecondId, ByEmail, BySecondEmail]) {
			expect(await rowsFor(Person.id, Quiz.id)).toEqual([
				{ id: expect.any(Number), completed: 1, pending: 0, approved_by: LEARN_APPROVER, answers: null, updated_at: new Date('2026-10-02T14:05:11Z') },
			]);
		}
	});

	it('approves an unapproved row in place and leaves an approved one alone, deleting nothing', async () => {
		const Quiz = await factories.quiz.create({ nsda_course: 117271 });
		const ids = [nsdaId(), nsdaId()];
		const Started = await factories.person.create({ nsda: ids[0] });
		const Done = await factories.person.create({ nsda: ids[1] });
		const Approver = await factories.person.create();
		const Unapproved = await factories.personQuiz.create({ person: Started.id, quiz: Quiz.id, completed: 0, pending: 1, approved_by: null, answers: '{"q1":"b"}' });
		const Approved = await factories.personQuiz.create({ person: Done.id, quiz: Quiz.id, completed: 1, approved_by: Approver.id });
		getLearnCompletions.mockResolvedValue([completion(ids[0], Started.email), completion(ids[1], Done.email)]);

		const first = await syncLearnByCourse(Quiz);
		const second = await syncLearnByCourse(Quiz);

		expect(first).toMatchObject({ added: 0, approved: 1 });
		expect(second).toMatchObject({ added: 0, approved: 0 });
		expect(await rowsFor(Started.id, Quiz.id)).toEqual([expect.objectContaining({ id: Unapproved.id, completed: 1, pending: 0, approved_by: LEARN_APPROVER, answers: '{"q1":"b"}' })]);
		expect(await rowsFor(Done.id, Quiz.id)).toEqual([expect.objectContaining({ id: Approved.id, approved_by: Approver.id })]);
	});

	it('saves the completions that matched no account as the quiz\'s misses, and the reconcile\'s lines as its log, replacing the last run\'s', async () => {
		const Person = await factories.person.create();
		const linked = completion(nsdaId(), Person.email);
		const nobody = completion(nsdaId(), email('nobody'));

		const { Quiz, result } = await sync([linked, nobody]);

		expect(result).toMatchObject({ completions: 2, misses: 1 });
		expect(await stored(`quiz_misses_${Quiz.id}`)).toEqual([nobody]);
		expect(await stored(`quiz_log_${Quiz.id}`)).toEqual([expect.stringContaining(`Linked Tabroom ${Person.email} to NSDA ID: ${linked.person_id}`)]);

		getLearnCompletions.mockResolvedValue([linked]);
		await syncLearnByCourse(Quiz);

		expect(await stored(`quiz_misses_${Quiz.id}`)).toEqual([]);
		expect(await stored(`quiz_log_${Quiz.id}`)).toEqual([]);
	});

	it('does not count a completion as a miss when it shares an NSDA id or an email with another and an account has it', async () => {
		const shared = nsdaId();
		const Coach = await factories.person.create({ nsda: shared });
		const Graduate = await factories.person.create({ nsda: shared });
		const Other = await factories.person.create({ nsda: nsdaId() });

		const { Quiz, result } = await sync([
			completion(shared, Coach.email),
			completion(shared, Graduate.email),
			completion(Other.nsda!, Other.email),
			completion(nsdaId(), Other.email),
		]);

		expect(result).toMatchObject({ completions: 4, added: 3, misses: 0 });
		expect(await stored(`quiz_misses_${Quiz.id}`)).toEqual([]);
	});
});

describe('syncLearnByCourse: reconciling accounts', () => {
	it('gives an account with the completer\'s email and no NSDA id that id, with a change log entry', async () => {
		const Person = await factories.person.create();
		const id = nsdaId();

		await sync([completion(id, Person.email)]);

		expect(await nsdaOf(Person.id)).toBe(id);
		expect(await linkLogs(Person.id)).toEqual([`NSDA Learn linked user to ${id} because of email match`]);
	});

	it('keeps the Learn email as a second email when the NSDA id matches under another address, and any member found under the account\'s email as a second id', async () => {
		const id = nsdaId();
		const other = nsdaId();
		const learnEmail = email('school');
		const Person = await factories.person.create({ nsda: id });
		fetchNSDA.mockImplementation(async (path: string) => (
			path.startsWith('/search') ? [{ id: other, first: 'Dana', last: 'Reyes', type: 'member', name: 'Dana Reyes', description: `Dana Reyes (${other}) - Unlinked` }] : []
		));

		await sync([completion(id, learnEmail)]);

		expect(await settingOf(Person.id, 'nsda_email')).toBe(learnEmail);
		expect(await settingOf(Person.id, 'nsda_id')).toBe(String(other));
		expect(await nsdaOf(Person.id)).toBe(id);
	});

	it('does not search the NSDA for a second id when the account already has one', async () => {
		const id = nsdaId();
		const second = nsdaId();
		const learnEmail = email('school');
		const Person = await factories.person.create({ nsda: id, settings: { nsda_id: String(second) } });

		await sync([completion(id, learnEmail)]);

		expect(fetchNSDA).not.toHaveBeenCalled();
		expect(await settingOf(Person.id, 'nsda_email')).toBe(learnEmail);
		expect(await settingOf(Person.id, 'nsda_id')).toBe(String(second));
	});

	describe('when the email matches and both the account\'s NSDA ids are other ids', () => {
		const setup = async (members: Record<'tabroom' | 'learn', { first: string, last: string } | Error | null>) => {
			const main = nsdaId();
			const learn = nsdaId();
			const Person = await factories.person.create({ nsda: main, first: 'Dana', last: 'Reyes', settings: { nsda_id: String(nsdaId()) } });
			// A name stands for a member with that name; null for an id the NSDA does not have, which it answers with a record that has no member in it
			fetchNSDA.mockImplementation(async (path: string) => {
				const id = path === `/members/${main}` ? main : path === `/members/${learn}` ? learn : null;
				if (!id) return [];
				const answer = id === main ? members.tabroom : members.learn;
				if (answer instanceof Error) throw answer;
				return answer ? { person_id: id, ...answer } : { disabled: false, deceased: false, addresses: [] };
			});
			await sync([completion(learn, Person.email)]);
			return { Person, main, learn };
		};

		it('switches to the completer\'s id when the account\'s own is not a member and the completer\'s first and last name both match', async () => {
			const { Person, main, learn } = await setup({ tabroom: null, learn: { first: 'Dana', last: 'Reyes' } });

			expect(await nsdaOf(Person.id)).toBe(learn);
			expect(await linkLogs(Person.id)).toEqual([`NSDA Learn unlinked invalid NSDA ID ${main}.  Switched to ${learn}`]);
		});

		it('removes the id when the account\'s own is not a member and only one of the completer\'s names matches', async () => {
			const { Person, main } = await setup({ tabroom: null, learn: { first: 'Dana', last: 'Ruiz' } });

			expect(await nsdaOf(Person.id)).toBeNull();
			expect(await linkLogs(Person.id)).toEqual([`NSDA Learn unlinked from invalid NSDA ID ${main}`]);
		});

		it('switches when its own id belongs to someone else by name and the completer\'s name matches in full', async () => {
			const { Person, learn } = await setup({ tabroom: { first: 'Sam', last: 'Ruiz' }, learn: { first: 'Dana', last: 'Reyes' } });

			expect(await nsdaOf(Person.id)).toBe(learn);
		});

		it('removes the id when its own belongs to someone else by name and the completer\'s does not match in full', async () => {
			const { Person, main } = await setup({ tabroom: { first: 'Sam', last: 'Ruiz' }, learn: { first: 'Dana', last: 'Ruiz' } });

			expect(await nsdaOf(Person.id)).toBeNull();
			expect(await linkLogs(Person.id)).toEqual([`NSDA Learn unlinked from ${main} due to name and ID mismatch`]);
		});

		it('leaves the id alone when its own member shares a name with the account', async () => {
			const { Person, main } = await setup({ tabroom: { first: 'Dana', last: 'Ruiz' }, learn: { first: 'Dana', last: 'Reyes' } });

			expect(await nsdaOf(Person.id)).toBe(main);
			expect(await linkLogs(Person.id)).toEqual([]);
		});

		it('changes nothing when a member lookup fails, where masoncards switched or removed the id', async () => {
			const { Person, main } = await setup({ tabroom: new NSDAError('The NSDA API did not answer GET /members/1 within 60 seconds'), learn: { first: 'Dana', last: 'Reyes' } });

			expect(await nsdaOf(Person.id)).toBe(main);
			expect(await linkLogs(Person.id)).toEqual([]);
			expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`reconcile person ${Person.id}`), expect.objectContaining({ 'event.name': 'job.learn-course-sync.member_lookup.exception' }));
		});
	});
});

describe('syncLearnCourses', () => {
	it('syncs every quiz tied to a Learn course and totals what they did', async () => {
		const ids = [nsdaId(), nsdaId()];
		const First = await factories.quiz.create({ nsda_course: 117271 });
		const Second = await factories.quiz.create({ nsda_course: 117802 });
		const Person = await factories.person.create({ nsda: ids[0] });
		const Other = await factories.person.create({ nsda: ids[1] });
		const getQuizzes = vi.spyOn(quizRepo, 'getQuizzes').mockResolvedValue([First, Second]);
		getLearnCompletions.mockImplementation(async (course: number) => (
			course === 117271 ? [completion(ids[0], Person.email), completion(ids[1], Other.email)] : [completion(ids[0], Person.email), completion(nsdaId(), email('nobody'))]
		));

		await expect(syncLearnCourses()).resolves.toEqual({ courses: 2, completions: 4, added: 3, approved: 0, misses: 1 });

		expect(getQuizzes).toHaveBeenCalledExactlyOnceWith(expect.anything(), { learnCourse: true });
		expect(await rowsFor(Person.id, Second.id)).toHaveLength(1);
	});

	it('fails when a course fails, as masoncards\' run did', async () => {
		const Quiz = await factories.quiz.create({ nsda_course: 117271 });
		vi.spyOn(quizRepo, 'getQuizzes').mockResolvedValue([Quiz]);
		getLearnCompletions.mockRejectedValue(new NSDAError('The NSDA API answered GET /learn/courses/117271 with 503 Service Unavailable', { status: 503 }));

		await expect(syncLearnCourses()).rejects.toThrow('503 Service Unavailable');
	});
});
