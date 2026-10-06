import { Router } from 'express';
import * as controller from '../../../controllers/public/status.js';
import { SystemStatusSchema } from '@tabroom/types';
import { requireSiteAdmin } from '../../../middleware/auth/authorization.js';
const router = Router();

router.route('/').get(controller.systemStatus).openapi = {
	summary: 'Get system status',
	description: 'Returns the current system status including server load, memory usage, and other relevant information.',
	path: '/status',
	operationId : 'getStatus',
	responses   : {
		200: {
			description: 'Server is up',
			content: {
				'application/json': {
					schema: SystemStatusSchema
				}
			},
		},
	},
	tags: ['Admin'],
};
router.route('/barf').get(requireSiteAdmin,controller.barf).openapi = {
	summary: 'Trigger a barf',
	description: 'Endpoint to trigger a barf for testing purposes.',
	path: '/status/barf',
	operationId: 'barfPlease',
	responses: {
		500:{
			description: 'Server threw an error as a result of the barf endpoint being triggered.',
		},
	},
	tags: ['Admin'],
};
export default router;
