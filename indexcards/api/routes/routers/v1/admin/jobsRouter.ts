import { Router } from 'express';
import z from 'zod';
import { ScheduledJobListSchema, ScheduledJobRunSchema } from '@tabroom/types';
import { getJobs, runJob } from '../../../../controllers/admin/jobsController.js';
import { ValidateRequest } from '../../../../middleware/validation.js';

// Mounted from the v1 index with requireSiteAdmin, outside the dev-only block the rest of /admin sits in
const router = Router();

router.route('/').get(getJobs).openapi = {
	path: '/admin/jobs',
	operationId: 'AdminJobs',
	summary: 'List scheduled jobs',
	description: 'Every job the API runs on a timer, by name, with its schedule, whether it is switched on here, its next and last runs, and whether it is overdue or failing. Site administrators only',
	tags: ['Orval', 'admin:jobs'],
	responses: {
		200: {
			description: 'The scheduled jobs',
			content: {
				'application/json': {
					schema: ScheduledJobListSchema,
				},
			},
		},
		403: { $ref: '#/components/responses/Forbidden' },
		503: { description: 'The job queues are unavailable' },
	},
};

router.route('/:jobName/run').post(ValidateRequest, runJob).openapi = {
	path: '/admin/jobs/{jobName}/run',
	operationId: 'AdminJobRun',
	summary: 'Run a scheduled job now',
	description: 'Queues one run of a scheduled job without changing its schedule. Refused while the job is switched off in this environment and while a run is already in progress or waiting. Site administrators only',
	tags: ['Orval', 'admin:jobs'],
	requestParams: {
		path: z.object({
			jobName: z.string().min(1).max(100).meta({ description: 'Name of the scheduled job' }),
		}),
	},
	responses: {
		202: {
			description: 'The run was queued',
			content: {
				'application/json': {
					schema: ScheduledJobRunSchema,
				},
			},
		},
		400: { $ref: '#/components/responses/BadRequest' },
		403: { $ref: '#/components/responses/Forbidden' },
		404: { $ref: '#/components/responses/NotFound' },
		409: { description: 'The job is switched off, or a run is already in progress or waiting' },
		503: { description: 'The job queues are unavailable' },
	},
};

export default router;
