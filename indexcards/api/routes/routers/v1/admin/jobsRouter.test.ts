import request from 'supertest';
import { ScheduledJobListSchema, ScheduledJobRunSchema } from '@tabroom/types';
import type { ScheduledJob } from '@tabroom/types';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { countQueries } from '../../../../../tests/queryCounter.js';
import config from '../../../../config.js';
import logger from '../../../../helpers/logger.js';
import { getScheduledJobs } from '../../../../services/queue/scheduledJobs.js';

// The one scheduled queue's state in Redis, faked so the tests need no Redis
const { queue, redisDown } = vi.hoisted(() => ({
	queue: {
		getJobSchedulers: vi.fn(),
		getCompleted: vi.fn(),
		getFailed: vi.fn(),
		getActive: vi.fn(),
		getWaitingCount: vi.fn(),
		getActiveCount: vi.fn(),
		getDeduplicationJobId: vi.fn(),
		add: vi.fn(),
	},
	redisDown: { value: false },
}));
vi.mock('../../../../services/queue/queues.js', async (importOriginal) => ({
	...await importOriginal<typeof import('../../../../services/queue/queues.js')>(),
	getQueue: () => queue,
}));
vi.mock('../../../../services/queue/connection.js', async (importOriginal) => ({
	...await importOriginal<typeof import('../../../../services/queue/connection.js')>(),
	isRedisDown: () => redisDown.value,
}));

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const minutes = (count: number) => count * 60 * 1000;

describe('Admin jobs router', () => {
	const flag = { ...config.jobs.learnCourseSync };
	let admin: string;
	let coach: string;
	let adminAsCoach: string;
	let adminAsAdmin: string;
	let adminEmail: string;
	let otherAdminEmail: string;

	const list = async () => {
		const res = await request(server).get('/v1/admin/jobs').asPerson(admin).expect(200);
		expect(res.body).toMatchSchema(ScheduledJobListSchema);
		return res.body.jobs as ScheduledJob[];
	};
	const run = (userkey: string, name = 'learn-course-sync') => request(server).post(`/v1/admin/jobs/${name}/run`).asPerson(userkey);

	beforeAll(async () => {
		const Admin = await factories.person.create({ site_admin: 1 });
		const OtherAdmin = await factories.person.create({ site_admin: 1 });
		const Coach = await factories.person.create({ site_admin: 0 });
		adminEmail = Admin.email;
		otherAdminEmail = OtherAdmin.email;
		({ userkey: admin } = await factories.session.create({ person: Admin.id }));
		({ userkey: coach } = await factories.session.create({ person: Coach.id }));
		({ userkey: adminAsCoach } = await factories.session.create({ person: Coach.id, su: Admin.id }));
		({ userkey: adminAsAdmin } = await factories.session.create({ person: OtherAdmin.id, su: Admin.id }));
	});

	afterAll(() => {
		Object.assign(config.jobs.learnCourseSync, flag);
		vi.useRealTimers();
	});

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'], now: NOW });
		Object.assign(config.jobs.learnCourseSync, { enabled: true });
		redisDown.value = false;
		// A healthy job: next run in 20 minutes, last run completed 10 minutes ago
		queue.getJobSchedulers.mockReset().mockResolvedValue([{ key: 'learn-course-sync', next: NOW + minutes(20) }]);
		queue.getCompleted.mockReset().mockResolvedValue([{
			processedOn: NOW - minutes(10) - 250, finishedOn: NOW - minutes(10), attemptsMade: 1, returnvalue: { courses: 4, failed: 0 },
		}]);
		queue.getFailed.mockReset().mockResolvedValue([]);
		queue.getActive.mockReset().mockResolvedValue([]);
		queue.getWaitingCount.mockReset().mockResolvedValue(0);
		queue.getActiveCount.mockReset().mockResolvedValue(0);
		queue.getDeduplicationJobId.mockReset().mockResolvedValue(null);
		queue.add.mockReset().mockResolvedValue({ id: '42' });
	});

	describe('GET /v1/admin/jobs', () => {
		it('is for site administrators only, including while su\'d', async () => {
			expect(await request(server).get('/v1/admin/jobs')).toBeProblemResponse(401);
			expect(await request(server).get('/v1/admin/jobs').asPerson(coach)).toBeProblemResponse(403);
			expect(await request(server).get('/v1/admin/jobs').asPerson(adminAsCoach)).toBeProblemResponse(403);
		});

		it('lists a healthy job with its schedule, next run, and last run', async () => {
			expect(await list()).toEqual([{
				name: 'learn-course-sync',
				description: expect.any(String),
				Schedule: { every: minutes(30) },
				enabled: true,
				nextRun: '2026-11-11T12:20:00.000Z',
				Running: null,
				queued: false,
				LastRun: {
					outcome: 'completed',
					finishedAt: '2026-11-11T11:50:00.000Z',
					durationMs: 250,
					attempts: 1,
					result: { courses: 4, failed: 0 },
					error: null,
				},
				lastSuccess: '2026-11-11T11:50:00.000Z',
				overdue: false,
				failing: false,
			}]);
		});

		it('shows a job that is switched off with no next run and never overdue', async () => {
			config.jobs.learnCourseSync.enabled = false;
			queue.getJobSchedulers.mockResolvedValue([]);

			expect((await list())[0]).toMatchObject({ enabled: false, nextRun: null, overdue: false });
		});

		it('shows a job that has never run', async () => {
			queue.getCompleted.mockResolvedValue([]);

			expect((await list())[0]).toMatchObject({ LastRun: null, lastSuccess: null, failing: false });
		});

		it('marks a job overdue once its run is more than 10 minutes late', async () => {
			queue.getJobSchedulers.mockResolvedValue([{ key: 'learn-course-sync', next: NOW - minutes(10) }]);
			expect((await list())[0].overdue).toBe(false);

			queue.getJobSchedulers.mockResolvedValue([{ key: 'learn-course-sync', next: NOW - minutes(10) - 1 }]);
			expect((await list())[0].overdue).toBe(true);
		});

		it('marks a job failing while its last failure is newer than its last success', async () => {
			queue.getFailed.mockResolvedValue([{
				processedOn: NOW - minutes(5) - 100, finishedOn: NOW - minutes(5), attemptsMade: 3, failedReason: 'NSDA 503 Service Unavailable',
			}]);
			expect((await list())[0]).toMatchObject({
				failing: true,
				lastSuccess: '2026-11-11T11:50:00.000Z',
				LastRun: { outcome: 'failed', attempts: 3, result: null, error: 'NSDA 503 Service Unavailable' },
			});

			queue.getCompleted.mockResolvedValue([]);
			expect((await list())[0]).toMatchObject({ failing: true, lastSuccess: null });

			queue.getCompleted.mockResolvedValue([{ processedOn: NOW - minutes(1) - 200, finishedOn: NOW - minutes(1), attemptsMade: 1, returnvalue: {} }]);
			expect((await list())[0]).toMatchObject({ failing: false, LastRun: { outcome: 'completed' } });
		});

		it('shows a run in progress and a run waiting', async () => {
			queue.getActive.mockResolvedValue([{ processedOn: NOW - 5_000 }]);
			queue.getWaitingCount.mockResolvedValue(1);

			expect((await list())[0]).toMatchObject({ Running: { startedAt: '2026-11-11T11:59:55.000Z' }, queued: true });
		});

		it('answers 503 when Redis is down', async () => {
			redisDown.value = true;

			expect(await request(server).get('/v1/admin/jobs').asPerson(admin)).toBeProblemResponse(503);
			expect(queue.getJobSchedulers).not.toHaveBeenCalled();
		});

		it('reads nothing from the database', async () => {
			expect((await countQueries(() => getScheduledJobs())).count).toBe(0);
		});
	});

	describe('POST /v1/admin/jobs/:jobName/run', () => {
		it('is for site administrators only, including while su\'d', async () => {
			expect(await request(server).post('/v1/admin/jobs/learn-course-sync/run')).toBeProblemResponse(401);
			expect(await run(coach)).toBeProblemResponse(403);
			expect(await run(adminAsCoach)).toBeProblemResponse(403);
			expect(queue.add).not.toHaveBeenCalled();
		});

		it('queues one run that a second request cannot double up, and logs who asked', async () => {
			const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);

			const res = await run(admin).expect(202);

			expect(res.body).toMatchSchema(ScheduledJobRunSchema);
			expect(res.body).toEqual({ name: 'learn-course-sync', jobId: '42' });
			expect(queue.add).toHaveBeenCalledExactlyOnceWith('learn-course-sync', {}, { deduplication: { id: 'run-now' } });
			expect(info).toHaveBeenCalledWith(`Scheduled job learn-course-sync run requested by ${adminEmail}`, expect.objectContaining({
				'event.name': 'queue.job.manual_run',
				'bullmq.queue.name': 'learn-course-sync',
			}));
			info.mockRestore();
		});

		it('logs the admin behind an su', async () => {
			const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);

			await run(adminAsAdmin).expect(202);

			expect(info).toHaveBeenCalledWith(`Scheduled job learn-course-sync run requested by ${adminEmail} while su'd as ${otherAdminEmail}`, expect.anything());
			info.mockRestore();
		});

		it('answers 404 for anything that is not a scheduled job', async () => {
			expect(await run(admin, 'nope')).toBeProblemResponse(404);
			expect(await run(admin, 'email')).toBeProblemResponse(404);
			expect(queue.add).not.toHaveBeenCalled();
		});

		it('refuses while the job is switched off', async () => {
			config.jobs.learnCourseSync.enabled = false;

			expect(await run(admin)).toBeProblemResponse(409);
			expect(queue.add).not.toHaveBeenCalled();
		});

		it('refuses while a run is in progress, waiting, or already requested', async () => {
			queue.getActiveCount.mockResolvedValueOnce(1);
			expect(await run(admin)).toBeProblemResponse(409);

			queue.getWaitingCount.mockResolvedValueOnce(1);
			expect(await run(admin)).toBeProblemResponse(409);

			queue.getDeduplicationJobId.mockResolvedValueOnce('41');
			expect(await run(admin)).toBeProblemResponse(409);

			expect(queue.add).not.toHaveBeenCalled();
		});

		it('answers 503 when Redis is down', async () => {
			redisDown.value = true;

			expect(await run(admin)).toBeProblemResponse(503);
			expect(queue.add).not.toHaveBeenCalled();
		});
	});
});
