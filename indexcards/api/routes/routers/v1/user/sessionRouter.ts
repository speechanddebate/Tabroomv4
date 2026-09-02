import { Router } from 'express';
import { SessionSchema } from '@tabroom/types';

const router = Router();

import { getSession } from '../../../../controllers/user/person/session.js';

router.route('/').get(getSession).openapi = {
	path: '/user/session',
	summary: 'Get Session',
	description: 'Get the current user session',
	operationId: 'UserSession',
	tags: ['Session', 'Orval'],
	responses: {
		200: {
			description: 'User session',
			content: {
				'application/json': {
					schema: SessionSchema,
				},
			},
		},
		404: {
			$ref: '#/components/responses/NotFound',
		},
	},
};

export default router;