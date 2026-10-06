import { Router } from 'express';
import serversRouter from'./serversRouter.js';

import * as controller from '../../../../controllers/admin/mailtestController.js';
import { requireAuth } from '../../../openapi/security.js';

const router = Router();
router.use('/servers', serversRouter);

router.route('/mailtest/error').get(controller.throwTestError).openapi = {
	path: '/admin/mailtest/error',
	summary: 'Undocumented Endpoint',
	tags: ['Admin : Mail'],
	security: requireAuth,
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/mailtest/slack').get(controller.testSlackNotification).openapi = {
	path: '/admin/mailtest/slack',
	summary: 'Undocumented Endpoint',
	tags: ['Admin : Mail'],
	security: requireAuth,
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

export default router;