import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../../../../../controllers/user/push.js';
import { RateLimitExceeded } from '../../../../../helpers/problem.js';
import { requirePerson } from '../../../../../middleware/auth/authorization.js';
import { PushStatusSchema, PushSubscribeRequestSchema } from '@tabroom/types';
import z from 'zod';
import { ValidateRequest } from '../../../../../middleware/validation.js';

const router = Router();

router.use(requirePerson);

const forbiddenWhileSu = { $ref: '#/components/responses/Forbidden' };
const unavailable = { $ref: '#/components/responses/ServiceUnavailable' };

router.route('/')
	.get(ValidateRequest, controller.getPushStatus)
	.put(ValidateRequest, controller.savePushSubscription)
	.delete(ValidateRequest, controller.disablePush).openapi = {
		path: '/user/notify/push',
		tags: ['Orval', 'user:push'],
		get: {
			operationId: 'UserNotifyPush',
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
			operationId: 'UserNotifyPushSubscribe',
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
			operationId: 'UserNotifyPushUnsubscribe',
			summary: 'Turn off push',
			description: 'Remove the push subscription from the current login and turn push off for it',
			responses: {
				204: { description: 'Push turned off for this login' },
				403: forbiddenWhileSu,
			},
		},
	};

// Each test is a real send through the push service, so a held-down button can't flood it
const TEST_LIMIT = 5;
const testLimiter = rateLimit({
	windowMs: 60 * 1000,
	limit: TEST_LIMIT,
	// requirePerson has run, so every request here has a login session
	keyGenerator: (req) => `push-test:${req.auth.sessionId}`,
	handler: (req, res) => RateLimitExceeded(req, res, `You can send ${TEST_LIMIT} test notifications a minute. Wait a minute and try again.`),
});

router.route('/test').post(ValidateRequest, testLimiter, controller.sendTestPush).openapi = {
	path: '/user/notify/push/test',
	operationId: 'UserNotifyPushTest',
	summary: 'Send a test notification',
	description: `Queue one push notification to the current login's subscription, so the person can check push works on this browser. Goes through the notification queue like any other push but stays out of the inbox. Limited to ${TEST_LIMIT} a minute per login`,
	tags: ['Orval', 'user:push'],
	responses: {
		202: { description: 'The test notification is queued for this login' },
		403: forbiddenWhileSu,
		409: { $ref: '#/components/responses/Conflict' },
		429: { $ref: '#/components/responses/TooManyRequests' },
		503: unavailable,
	},
};

router.route('/sessions/:session').delete(ValidateRequest, controller.disableSessionPush).openapi = {
	path: '/user/notify/push/sessions/{session}',
	operationId: 'UserNotifyPushUnsubscribeSession',
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
