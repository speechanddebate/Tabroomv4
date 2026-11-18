import { Router } from 'express';
import z from 'zod';
import { EmailConfirmResponseSchema, EmailConfirmStatusSchema } from '@tabroom/types';
import { confirm, status } from '../../../../controllers/rest/emailConfirmController.js';
import { ValidateRequest } from '../../../../middleware/validation.js';

// Public: the token in the link is the only credential. Anyone holding it can confirm that
// person's current address and nothing more

const router = Router();

const tokenParams = {
	path: z.object({
		token: z.string().max(1024).meta({ description: 'The token from the confirmation link in an email' }),
	}),
};

router.route('/confirm/:token').get(ValidateRequest, status).openapi = {
	path: '/rest/email/confirm/{token}',
	summary: 'Who a confirmation link is for',
	operationId: 'RestEmailConfirmStatus',
	description: 'Reports which address the link confirms (masked) and whether it already is. Changes nothing. A link a newer code or another address replaced is 404; one over 7 days old is 410.',
	tags: ['Email confirmation', 'Orval'],
	security: [],
	requestParams: tokenParams,
	responses: {
		200: {
			description: 'The link is valid',
			content: { 'application/json': { schema: EmailConfirmStatusSchema } },
		},
		404: { $ref: '#/components/responses/NotFound' },
		410: { $ref: '#/components/responses/Gone' },
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};

router.route('/confirm/:token').post(ValidateRequest, confirm).openapi = {
	path: '/rest/email/confirm/{token}',
	summary: 'Use a confirmation link',
	operationId: 'RestEmailConfirm',
	description: 'Confirms the address the link is for and turns email back on, with no login. Confirming an address already confirmed answers the same. A replaced link is 404; one over 7 days old is 410.',
	tags: ['Email confirmation', 'Orval'],
	security: [],
	requestParams: tokenParams,
	responses: {
		200: {
			description: 'The address is confirmed',
			content: { 'application/json': { schema: EmailConfirmResponseSchema } },
		},
		404: { $ref: '#/components/responses/NotFound' },
		410: { $ref: '#/components/responses/Gone' },
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};

export default router;
