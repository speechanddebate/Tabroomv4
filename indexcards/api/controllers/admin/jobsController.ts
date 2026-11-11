import type { Request, Response } from 'express';
import type { ScheduledJobList, ScheduledJobRun } from '@tabroom/types';
import logger from '../../helpers/logger.js';
import { Conflict, NotFound, ServiceUnavailable } from '../../helpers/problem.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getScheduledJobs, JobsUnavailableError, runScheduledJob, type RunScheduledJobResult } from '../../services/queue/scheduledJobs.js';

/** Every scheduled job with its schedule and current state */
export const getJobs = async (req: Request, res: Response) => {
	try {
		return res.status(200).json({ jobs: await getScheduledJobs() } satisfies ScheduledJobList);
	} catch (error) {
		if (error instanceof JobsUnavailableError) return ServiceUnavailable(req, res, 'The job queues are unavailable right now');
		throw error;
	}
};

/** Queues one run of a scheduled job now and logs who asked for it */
export const runJob = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	const jobName: string = req.params.jobName;

	let result: RunScheduledJobResult;
	try {
		result = await runScheduledJob(jobName);
	} catch (error) {
		if (error instanceof JobsUnavailableError) return ServiceUnavailable(req, res, 'The job queues are unavailable right now');
		throw error;
	}

	if (result.status !== 'queued') {
		if (result.status === 'unknown') return NotFound(req, res, `No scheduled job named ${jobName}`);
		return Conflict(req, res, result.status === 'disabled'
			? `${jobName} is switched off in this environment`
			: `${jobName} already has a run in progress or waiting`);
	}

	const requester = req.auth.su ? `${req.auth.su.email} while su'd as ${person.email}` : person.email;
	logger.info(`Scheduled job ${jobName} run requested by ${requester}`, {
		'event.name': 'queue.job.manual_run',
		'bullmq.queue.name': jobName,
		person: person.id,
	});

	return res.status(202).json({ name: jobName, jobId: result.jobId } satisfies ScheduledJobRun);
};
