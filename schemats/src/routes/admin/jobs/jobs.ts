import type { ScheduledJob } from '@tabroom/types';
import { showDateTime, showRelative } from '$lib/helpers/dt';

export type JobTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

/**
 * The one badge a job shows. A job that is switched off is only ever Off, whatever its last run
 * did; after that the worst news wins, so a failing job that is also running reads as Failing
 */
export function jobStatus(job: ScheduledJob): { label: string, tone: JobTone } {
	if (!job.enabled) return { label: 'Off', tone: 'muted' };
	if (job.failing) return { label: 'Failing', tone: 'danger' };
	if (job.overdue) return { label: 'Overdue', tone: 'warning' };
	if (job.Running) return { label: 'Running', tone: 'info' };
	if (job.queued) return { label: 'Queued', tone: 'info' };
	return { label: 'On schedule', tone: 'success' };
}

const plural = (count: number, unit: string) => count === 1 ? unit : `${count} ${unit}s`;

/** A job's schedule in words: "Every 30 minutes", or its cron pattern with the zone it is read in */
export function scheduleText(schedule: ScheduledJob['Schedule']): string {
	if ('pattern' in schedule) return `${schedule.pattern} (${schedule.tz})`;

	const seconds = schedule.every / 1000;
	if (seconds % 3600 === 0) return `Every ${plural(seconds / 3600, 'hour')}`;
	if (seconds % 60 === 0) return `Every ${plural(seconds / 60, 'minute')}`;
	return `Every ${plural(seconds, 'second')}`;
}

/** Why a run can't be asked for right now, or null when it can. The API refuses the same cases */
export function runBlockedReason(job: ScheduledJob): string | null {
	if (!job.enabled) return 'Switched off here';
	if (job.Running) return 'A run is in progress';
	if (job.queued) return 'A run is waiting to start';
	return null;
}

/** How long a run took: "205 ms", "4.2 s", "3 min 5 s" */
export function durationText(ms: number | null): string {
	if (ms === null) return '';
	if (ms < 1000) return `${ms} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
	return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/**
 * What the last run has to say: the error when it failed, otherwise the counts it returned
 * ("4 courses, 0 failed"). A result that is not a flat object of numbers and text shows nothing
 */
export function lastRunText(lastRun: NonNullable<ScheduledJob['LastRun']>): string {
	if (lastRun.outcome === 'failed') return lastRun.error ?? 'No error message';

	const result = lastRun.result;
	if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
	return Object.entries(result)
		.filter(([, value]) => typeof value === 'number' || typeof value === 'string')
		.map(([key, value]) => `${value} ${key}`)
		.join(', ');
}

/** A run time as the admin reads it: the clock time in their zone, and how far off it is */
export function runTime(iso: string, tz: string, now?: string): { at: string, relative: string } {
	return {
		at: showDateTime({ dtISO: iso, tz, format: 'medium', joinWord: 'at' }),
		relative: showRelative({ dtISO: iso, tz }, now),
	};
}
