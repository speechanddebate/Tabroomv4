
import { z } from 'zod';

export const SystemStatusSchema = z.object({
	message  : z.string(),
	name     : z.string(),
	version  : z.string(),
	commit   : z.string().meta({
		description: 'Commit hash of the current build',
	}),
	webhost  : z.string(),
	server   : z.string(),
	load     : z.array(z.number()),
	uptime   : z.number(),
	freemem  : z.number(),
	totalmem : z.number(),
	node     : z.string(),
	runtime  : z.string().optional(),
	database : z.string(),
});

export type SystemStatus = z.infer<typeof SystemStatusSchema>;

export const ScheduledJobSchema = z.object({
	name: z.string().meta({ description: 'The job\'s queue name, which is also its id in the run path' }),
	description: z.string().nullable(),
	Schedule: z.union([
		z.object({ every: z.number().meta({ description: 'Milliseconds between runs' }) }).strict(),
		z.object({
			pattern: z.string().meta({ description: 'Cron pattern' }),
			tz: z.string().meta({ description: 'Time zone the pattern is read in' }),
		}).strict(),
	]),
	enabled: z.boolean().meta({ description: 'Whether the job is switched on in this environment' }),
	nextRun: z.iso.datetime().nullable().meta({ description: 'When the next run is due. Null while the job is switched off' }),
	Running: z.object({ startedAt: z.iso.datetime() }).nullable().meta({ description: 'The run in progress, if there is one' }),
	queued: z.boolean().meta({ description: 'Whether a run is waiting to start' }),
	LastRun: z.object({
		outcome: z.enum(['completed', 'failed']).meta({ description: 'failed means every attempt failed' }),
		finishedAt: z.iso.datetime(),
		durationMs: z.number().nullable().meta({ description: 'How long the run took once a worker picked it up' }),
		attempts: z.number(),
		result: z.unknown().meta({ description: 'What the job returned. Null when it failed' }),
		error: z.string().nullable().meta({ description: 'Why the run failed. Null when it completed' }),
	}).nullable().meta({ description: 'The most recently finished run, however it ended' }),
	lastSuccess: z.iso.datetime().nullable().meta({ description: 'When a run last completed' }),
	overdue: z.boolean().meta({ description: 'Switched on and more than 10 minutes past its next run' }),
	failing: z.boolean().meta({ description: 'The latest finished run failed and none has completed since' }),
}).meta({
	id: 'ScheduledJob',
	description: 'A job the API runs on a timer, with its schedule and current state',
});

export const ScheduledJobListSchema = z.object({
	jobs: z.array(ScheduledJobSchema),
}).meta({ id: 'ScheduledJobList' });

export const ScheduledJobRunSchema = z.object({
	name: z.string(),
	jobId: z.string().meta({ description: 'The id of the queued run' }),
}).meta({
	id: 'ScheduledJobRun',
	description: 'A run of a scheduled job queued on request',
});

export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;
export type ScheduledJobList = z.infer<typeof ScheduledJobListSchema>;
export type ScheduledJobRun = z.infer<typeof ScheduledJobRunSchema>;