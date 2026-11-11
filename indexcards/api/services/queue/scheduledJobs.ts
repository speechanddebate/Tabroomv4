import type { Queue } from 'bullmq';
import type { ScheduledJob } from '@tabroom/types';
import { isRedisDown } from './connection.js';
import { scheduledQueues } from './jobs/index.js';
import { ENQUEUE_TIMEOUT, getQueue } from './queues.js';

/** How late a run may start before its job reads as overdue, in ms. The TabroomScheduledJobOverdue alert uses the same 10 minutes */
export const OVERDUE_AFTER = 10 * 60 * 1000;

/** Marks a run added on request, so a second request while it is unfinished adds nothing */
const RUN_NOW = 'run-now';

/** Redis is down or too slow to answer a request about the scheduled jobs */
export class JobsUnavailableError extends Error {}

/**
 * Runs Redis reads or writes for a request, failing instead of waiting when Redis is down:
 * the client would hold the commands until it reconnects, and the request needs an answer.
 * Both functions below need it, which is why it is a function
 */
async function askRedis<T>(commands: () => Promise<T>): Promise<T> {
	if (isRedisDown()) throw new JobsUnavailableError('Job queues are not connected to Redis');

	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new JobsUnavailableError(`Timed out after ${ENQUEUE_TIMEOUT}ms waiting for Redis`)), ENQUEUE_TIMEOUT);
		timer.unref();
	});
	try {
		return await Promise.race([commands(), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Every scheduled job with its schedule and its state in Redis, by name. Reads the same things
 * the scheduler gauges do, and marks a job overdue or failing by the rules the alerts use, so
 * the admin page, the dashboard, and the alerts agree
 */
export async function getScheduledJobs(now = Date.now()): Promise<ScheduledJob[]> {
	const jobs = await askRedis(() => Promise.all(scheduledQueues.map(async (definition): Promise<ScheduledJob> => {
		// A job's file gives its queue the one scheduler
		const [schedule] = definition.schedulers;
		const queue: Queue = getQueue(definition.name);
		const [schedulers, [completed], [failed], [active], waiting] = await Promise.all([
			queue.getJobSchedulers(),
			queue.getCompleted(0, 0),
			queue.getFailed(0, 0),
			queue.getActive(0, 0),
			queue.getWaitingCount(),
		]);
		const next = schedulers.find((scheduler) => scheduler.key === schedule.id)?.next;
		const enabled = schedule.enabled();
		const last = (failed?.finishedOn ?? 0) > (completed?.finishedOn ?? 0) ? failed : completed;

		return {
			name: definition.name,
			description: schedule.description ?? null,
			Schedule: schedule.repeat,
			enabled,
			nextRun: next ? new Date(next).toISOString() : null,
			Running: active?.processedOn ? { startedAt: new Date(active.processedOn).toISOString() } : null,
			queued: waiting > 0,
			LastRun: last?.finishedOn
				? {
					outcome: last === failed ? 'failed' : 'completed',
					finishedAt: new Date(last.finishedOn).toISOString(),
					durationMs: last.processedOn ? last.finishedOn - last.processedOn : null,
					attempts: last.attemptsMade,
					result: last === failed ? null : last.returnvalue ?? null,
					error: last === failed ? last.failedReason ?? null : null,
				}
				: null,
			lastSuccess: completed?.finishedOn ? new Date(completed.finishedOn).toISOString() : null,
			overdue: enabled && !!next && now - next > OVERDUE_AFTER,
			failing: !!failed?.finishedOn && failed.finishedOn > (completed?.finishedOn ?? 0),
		};
	})));
	return jobs.sort((a, b) => a.name.localeCompare(b.name));
}

export type RunScheduledJobResult =
	| { status: 'queued'; jobId: string }
	| { status: 'unknown' | 'disabled' | 'busy' };

/**
 * Adds one run of a scheduled job now, through its own queue and worker, leaving its schedule
 * alone. Refused while the job is switched off, so nothing here can start a job an environment
 * has not turned on, and while a run is in progress or waiting, since one more would only wait
 */
export async function runScheduledJob(name: string): Promise<RunScheduledJobResult> {
	const definition = scheduledQueues.find((candidate) => candidate.name === name);
	if (!definition) return { status: 'unknown' };

	const [schedule] = definition.schedulers;
	if (!schedule.enabled()) return { status: 'disabled' };

	return await askRedis(async () => {
		const queue: Queue = getQueue(definition.name);
		const [active, waiting, requested] = await Promise.all([
			queue.getActiveCount(),
			queue.getWaitingCount(),
			queue.getDeduplicationJobId(RUN_NOW),
		]);
		if (active || waiting || requested) return { status: 'busy' as const };

		// Two requests can both get past the check above; the deduplication id makes the second add a no-op
		const job = await queue.add(schedule.job.name, schedule.job.data, { deduplication: { id: RUN_NOW } });
		return { status: 'queued' as const, jobId: String(job.id) };
	});
}
