import { Router } from 'express';
import * as controller from '../../../../controllers/user/push.js';
import { requirePerson } from '../../../../middleware/auth/authorization.js';
import { PushStatusSchema, PushSubscribeRequestSchema } from '@tabroom/types';
import z from 'zod';
import { ValidateRequest } from '../../../../middleware/validation.js';

const router = Router();

router.use(requirePerson);

const forbiddenWhileSu = { $ref: '#/components/responses/Forbidden' };
const unavailable = { $ref: '#/components/responses/ServiceUnavailable' };

router.route('/')
	.get(ValidateRequest, controller.getPushStatus)
	.put(ValidateRequest, controller.savePushSubscription)
	.delete(ValidateRequest, controller.disablePush).openapi = {
		path: '/user/push',
		tags: ['Orval', 'user:push'],
		get: {
			operationId: 'UserPush',
			summary: 'Get push status',
			description: 'Get the VAPID public key and the push subscription status of the current login. Allowed while su\'d',
			responses: {
				200: {
					description: 'Push status',
					content: {
						'application/json': {
							schema: PushStatusSchema,
						},
					},
				},
				503: unavailable,
			},
		},
		put: {
			operationId: 'UserPushSubscribe',
			summary: 'Save push subscription',
			description: 'Save this browser\'s push subscription to the current login. Saving the same endpoint again changes nothing. Returns 409 if push is turned off for this login and enable is not true',
			requestBody: {
				required: true,
				content: {
					'application/json': {
						schema: PushSubscribeRequestSchema,
					},
				},
			},
			responses: {
				200: {
					description: 'Push status after saving',
					content: {
						'application/json': {
							schema: PushStatusSchema,
						},
					},
				},
				400: { $ref: '#/components/responses/BadRequest' },
				403: forbiddenWhileSu,
				409: { $ref: '#/components/responses/Conflict' },
				503: unavailable,
			},
		},
		delete: {
			operationId: 'UserPushUnsubscribe',
			summary: 'Turn off push',
			description: 'Remove the push subscription from the current login and turn push off for it',
			responses: {
				204: { description: 'Push turned off for this login' },
				403: forbiddenWhileSu,
			},
		},
	};

router.route('/sessions/:session').delete(ValidateRequest, controller.disableSessionPush).openapi = {
	path: '/user/push/sessions/{session}',
	operationId: 'UserPushUnsubscribeSession',
	summary: 'Turn off push on another login',
	description: 'Remove the push subscription from another of the user\'s logins and turn push off for it',
	tags: ['Orval', 'user:push'],
	requestParams: {
		path: z.object({
			session: z.coerce.number().int().meta({ description: 'The ID of the login session' }),
		}),
	},
	responses: {
		204: { description: 'Push turned off for that login' },
		403: forbiddenWhileSu,
		404: { $ref: '#/components/responses/NotFound' },
	},
};

export default router;
