import { Router } from 'express';
import z from 'zod';
import { SessionSchema, UserSessionSchema } from '@tabroom/types';
import { endSession, getSession, getSessions } from '../../../../controllers/user/sessions.js';
import { requirePerson } from '../../../../middleware/auth/authorization.js';
import { ValidateRequest } from '../../../../middleware/validation.js';

// mounted at the user root, so auth goes on each route rather than router.use
const router = Router();

router.route('/session').get(requirePerson, getSession).openapi = {
	path: '/user/session',
	summary: 'Get Session',
	description: 'Get the current user session',
	operationId: 'UserSession',
	tags: ['user:session', 'Orval'],
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

router.route('/sessions').get(requirePerson, ValidateRequest, getSessions).openapi = {
	path: '/user/sessions',
	operationId: 'UserSessions',
	summary: 'List sessions',
	description: 'List the user\'s logins, most recently used first, with the push status of each. Only the push service host is returned, never a login\'s push endpoint or keys. Allowed while su\'d',
	tags: ['Orval', 'user:session'],
	responses: {
		200: {
			description: 'The user\'s logins',
			content: {
				'application/json': {
					schema: z.array(UserSessionSchema),
				},
			},
		},
	},
};

router.route('/sessions/:sessionId').delete(requirePerson, ValidateRequest, endSession).openapi = {
	path: '/user/sessions/{sessionId}',
	operationId: 'UserSessionEnd',
	summary: 'End a session',
	description: 'Logs out one of the user\'s other logins, which also stops push to it. The current session is 400 (log out instead); another person\'s session is 404. Allowed while su\'d',
	tags: ['Orval', 'user:session'],
	requestParams: {
		path: z.object({
			sessionId: z.coerce.number().int().positive().meta({ description: 'ID of the session to end' }),
		}),
	},
	responses: {
		204: { description: 'Ended' },
		400: { $ref: '#/components/responses/BadRequest' },
		404: { $ref: '#/components/responses/NotFound' },
	},
};

export default router;
