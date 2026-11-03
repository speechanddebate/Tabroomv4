import { Router } from 'express';
import z from 'zod';
import { HomeResponseSchema } from '@tabroom/types';
import * as controller from '../../../../controllers/user/home/homeController.js';
import { ValidateRequest } from '../../../../middleware/validation.js';

const router = Router();

router.route('/').get(ValidateRequest, controller.getHome).openapi = {
	summary: 'Get the user home page',
	operationId: 'UserHome',
	path: '/user/home',
	tags: ['user:home', 'Orval'],
	description: 'Everything the user home page shows: account alerts and one card per tournament the person is running, upcoming, or just finished at.',
	requestParams: {
		query: z.object({
			current: z.stringbool().default(false).meta({ description: 'Return only the tournaments running now, for polling' }),
		}),
	},
	responses: {
		200: {
			description: 'The home page data',
			content: {
				'application/json': {
					schema: HomeResponseSchema,
				},
			},
		},
	},
};

export default router;
