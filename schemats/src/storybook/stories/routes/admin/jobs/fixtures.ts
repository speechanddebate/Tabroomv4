import type { ScheduledJob } from '@tabroom/types';

/** The instant the stories freeze the clock at, so "in 20 minutes" stays true */
export const now = '2026-11-11T18:00:00.000Z';

export const admin = { id: 4410, first: 'Avery', last: 'Quinn', email: 'aquinn@tabroom.example', tz: 'America/Chicago', site_admin: 1 };

const completed = (finishedAt: string, result: Record<string, number>, durationMs = 4200): ScheduledJob['LastRun'] => ({
	outcome: 'completed', finishedAt, durationMs, attempts: 1, result, error: null,
});

/** On schedule: ran ten minutes ago, runs again in twenty */
export const learnSync: ScheduledJob = {
	name: 'learn-course-sync',
	description: 'Pulls NSDA Learn course completions into judge quizzes',
	Schedule: { every: 30 * 60 * 1000 },
	enabled: true,
	nextRun: '2026-11-11T18:20:00.000Z',
	Running: null,
	queued: false,
	LastRun: completed('2026-11-11T17:50:00.000Z', { courses: 4, failed: 0 }),
	lastSuccess: '2026-11-11T17:50:00.000Z',
	overdue: false,
	failing: false,
};

/** One job in each state the page can show */
export const everyState: ScheduledJob[] = [
	learnSync,
	{
		...learnSync,
		name: 'districts-import',
		description: 'Copies NSDA districts, their schools, and their leaders',
		Schedule: { pattern: '45 4 * * *', tz: 'America/Chicago' },
		enabled: false,
		nextRun: null,
		LastRun: null,
		lastSuccess: null,
	},
	{
		...learnSync,
		name: 'points-post',
		description: 'Posts tournament points to the NSDA',
		Schedule: { every: 60 * 60 * 1000 },
		nextRun: '2026-11-11T18:07:00.000Z',
		LastRun: { outcome: 'failed', finishedAt: '2026-11-11T17:07:30.000Z', durationMs: 31_000, attempts: 3, result: null, error: 'NSDA 503 Service Unavailable' },
		lastSuccess: '2026-11-11T16:07:02.000Z',
		failing: true,
	},
	{
		...learnSync,
		name: 'invoice-status',
		description: 'Updates Nationals invoices with their paid status',
		Schedule: { every: 60 * 60 * 1000 },
		nextRun: '2026-11-11T17:30:00.000Z',
		LastRun: completed('2026-11-11T16:30:01.000Z', { invoices: 212, changed: 3 }, 185_000),
		lastSuccess: '2026-11-11T16:30:01.000Z',
		overdue: true,
	},
	{
		...learnSync,
		name: 'nats-appearances',
		description: 'Copies Nationals appearance counts for schools and students',
		Schedule: { pattern: '30 8 * * 4', tz: 'UTC' },
		nextRun: '2026-11-12T08:30:00.000Z',
		Running: { startedAt: '2026-11-11T17:59:40.000Z' },
		LastRun: completed('2026-11-05T08:31:10.000Z', { chapters: 1840, students: 9120 }, 70_000),
		lastSuccess: '2026-11-05T08:31:10.000Z',
	},
	{
		...learnSync,
		name: 'inbox-cleanup',
		description: 'Removes old messages from Tabroom inboxes',
		Schedule: { pattern: '15 9 * * *', tz: 'UTC' },
		nextRun: '2026-11-12T09:15:00.000Z',
		queued: true,
		LastRun: completed('2026-11-11T09:15:02.000Z', { removed: 5310 }, 205),
		lastSuccess: '2026-11-11T09:15:02.000Z',
	},
	{
		...learnSync,
		name: 'share-rooms-cleanup',
		description: 'Clears last week\'s share room names',
		Schedule: { pattern: '15 8 * * 4', tz: 'UTC' },
		nextRun: '2026-11-12T08:15:00.000Z',
		LastRun: null,
		lastSuccess: null,
	},
];
