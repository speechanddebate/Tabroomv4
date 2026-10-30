import { Router } from 'express';
import z from 'zod';
import { UnsubscribeResponseSchema, UnsubscribeStatusSchema } from '@tabroom/types';
import controller from '../../../../../controllers/rest/unsubscribeController.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';

// Public: the token in the link is the only credential. Anyone holding it can opt that
// person out of email and nothing more

const router = Router();

const tokenParams = {
	path: z.object({
		token: z.string().max(512).meta({ description: 'The token from the unsubscribe link in an email' }),
	}),
};

router.route('/unsubscribe/:token').get(ValidateRequest, controller.status).openapi = {
	path: '/rest/notify/email/unsubscribe/{token}',
	summary: 'Who an unsubscribe link is for',
	operationId: 'restNotifyEmailUnsubscribeStatus',
	description: 'Reports whose email the link opts out and whether it already has. Changes nothing. A request that prefers HTML is redirected to the unsubscribe page.',
	tags: ['Unsubscribe', 'Orval'],
	security: [],
	requestParams: tokenParams,
	responses: {
		200: {
			description: 'The link is valid',
			content: { 'application/json': { schema: UnsubscribeStatusSchema } },
		},
		302: { description: 'Redirect to the unsubscribe page, for a browser' },
		404: { $ref: '#/components/responses/NotFound' },
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};

router.route('/unsubscribe/:token').post(ValidateRequest, controller.unsubscribe).openapi = {
	path: '/rest/notify/email/unsubscribe/{token}',
	summary: 'Use an unsubscribe link',
	operationId: 'restNotifyEmailUnsubscribe',
	description: 'Opts the person the link is for out of Tabroom email. Also the one-click target mail providers POST to (RFC 8058); the body is ignored.',
	tags: ['Unsubscribe', 'Orval'],
	security: [],
	requestParams: tokenParams,
	responses: {
		200: {
			description: 'The person is opted out',
			content: { 'application/json': { schema: UnsubscribeResponseSchema } },
		},
		404: { $ref: '#/components/responses/NotFound' },
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};

export default router;
