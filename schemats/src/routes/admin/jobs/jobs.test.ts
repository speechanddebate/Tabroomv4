import type { ScheduledJob } from '@tabroom/types';
import { durationText, jobStatus, lastRunText, runBlockedReason, runTime, scheduleText } from './jobs';

const healthy: ScheduledJob = {
	name: 'learn-course-sync',
	description: 'Pulls NSDA Learn course completions into judge quizzes',
	Schedule: { every: 30 * 60 * 1000 },
	enabled: true,
	nextRun: '2026-11-11T12:20:00.000Z',
	Running: null,
	queued: false,
	LastRun: { outcome: 'completed', finishedAt: '2026-11-11T11:50:00.000Z', durationMs: 205, attempts: 1, result: { courses: 4, failed: 0 }, error: null },
	lastSuccess: '2026-11-11T11:50:00.000Z',
	overdue: false,
	failing: false,
};
const running = { startedAt: '2026-11-11T11:59:55.000Z' };

describe('jobStatus', () => {
	it('reads On schedule when nothing is wrong', () => {
		expect(jobStatus(healthy)).toEqual({ label: 'On schedule', tone: 'success' });
	});

	it('shows a run in progress ahead of one waiting', () => {
		expect(jobStatus({ ...healthy, queued: true }).label).toBe('Queued');
		expect(jobStatus({ ...healthy, queued: true, Running: running }).label).toBe('Running');
	});

	it('puts bad news ahead of a run in progress, failing ahead of overdue', () => {
		expect(jobStatus({ ...healthy, overdue: true, Running: running })).toEqual({ label: 'Overdue', tone: 'warning' });
		expect(jobStatus({ ...healthy, overdue: true, failing: true })).toEqual({ label: 'Failing', tone: 'danger' });
	});

	it('is only ever Off when switched off, even if its last run failed', () => {
		expect(jobStatus({ ...healthy, enabled: false, failing: true })).toEqual({ label: 'Off', tone: 'muted' });
	});
});

describe('scheduleText', () => {
	it('puts an interval in its largest whole unit', () => {
		expect(scheduleText({ every: 30 * 60 * 1000 })).toBe('Every 30 minutes');
		expect(scheduleText({ every: 60 * 60 * 1000 })).toBe('Every hour');
		expect(scheduleText({ every: 2 * 60 * 60 * 1000 })).toBe('Every 2 hours');
		expect(scheduleText({ every: 90 * 60 * 1000 })).toBe('Every 90 minutes');
		expect(scheduleText({ every: 30 * 1000 })).toBe('Every 30 seconds');
		expect(scheduleText({ every: 60 * 1000 })).toBe('Every minute');
	});

	it('shows a cron pattern with its time zone', () => {
		expect(scheduleText({ pattern: '15 9 * * *', tz: 'America/Chicago' })).toBe('15 9 * * * (America/Chicago)');
	});
});

describe('runBlockedReason', () => {
	it('lets a healthy job run', () => {
		expect(runBlockedReason(healthy)).toBeNull();
		expect(runBlockedReason({ ...healthy, failing: true, overdue: true })).toBeNull();
	});

	it('gives the reason a run cannot be asked for', () => {
		expect(runBlockedReason({ ...healthy, enabled: false })).toBe('Switched off here');
		expect(runBlockedReason({ ...healthy, Running: running })).toBe('A run is in progress');
		expect(runBlockedReason({ ...healthy, queued: true })).toBe('A run is waiting to start');
	});
});

describe('durationText', () => {
	it('picks a unit that fits', () => {
		expect(durationText(205)).toBe('205 ms');
		expect(durationText(4200)).toBe('4.2 s');
		expect(durationText(185_000)).toBe('3 min 5 s');
		expect(durationText(119_600)).toBe('2 min 0 s');
		expect(durationText(null)).toBe('');
	});
});

describe('lastRunText', () => {
	const lastRun = healthy.LastRun!;

	it('lists the counts a completed run returned', () => {
		expect(lastRunText(lastRun)).toBe('4 courses, 0 failed');
	});

	it('shows nothing for a result it cannot list', () => {
		expect(lastRunText({ ...lastRun, result: null })).toBe('');
		expect(lastRunText({ ...lastRun, result: [1, 2] })).toBe('');
		expect(lastRunText({ ...lastRun, result: { courses: 4, detail: { nested: true } } })).toBe('4 courses');
	});

	it('shows the error of a failed run', () => {
		expect(lastRunText({ ...lastRun, outcome: 'failed', result: null, error: 'NSDA 503 Service Unavailable' })).toBe('NSDA 503 Service Unavailable');
		expect(lastRunText({ ...lastRun, outcome: 'failed', result: null, error: null })).toBe('No error message');
	});
});

describe('runTime', () => {
	const now = '2026-11-11T12:00:00.000Z';

	it('gives the time in the admin\'s zone and how far off it is', () => {
		const next = runTime('2026-11-11T12:20:00.000Z', 'America/Chicago', now);

		expect(next.at).toContain('6:20');
		expect(next.relative).toBe('in 20 minutes');
		expect(runTime('2026-11-11T11:50:00.000Z', 'America/Chicago', now).relative).toBe('10 minutes ago');
	});
});
