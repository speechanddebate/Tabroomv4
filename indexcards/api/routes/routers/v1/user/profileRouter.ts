import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { EmailConfirmRequestSchema, UserProfileSchema, UserProfileUpdateSchema } from '@tabroom/types';
import { RateLimitExceeded } from '../../../../helpers/problem.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import { confirmEmail, resendEmailConfirmation, show, update } from '../../../../controllers/user/profile.js';

const router = Router();

// a borrowed login gets 10 wrong current passwords per 15 minutes; requests without one, and accepted ones (any status but 403), never count
const PASSWORD_LIMIT = 10;
const passwordLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: PASSWORD_LIMIT,
	skip: (req) => !req.body?.currentPassword,
	skipSuccessfulRequests: true,
	requestWasSuccessful: (_req, res) => res.statusCode !== 403,
	keyGenerator: (req) => `current-password:${req.person?.id}`,
	handler: (req, res) => RateLimitExceeded(req, res, 'Too many wrong passwords. Wait 15 minutes and try again.'),
});

// a guesser gets 10 tries per 15 minutes; a right code never counts
const CONFIRM_LIMIT = 10;
const confirmLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: CONFIRM_LIMIT,
	skipSuccessfulRequests: true,
	keyGenerator: (req) => `email-confirm:${req.person?.id}`,
	handler: (req, res) => RateLimitExceeded(req, res, 'Too many wrong codes. Wait 15 minutes and try again.'),
});

// Each resend is a real email, so only sends count and a refused resend (already confirmed) doesn't
const RESEND_LIMIT = 3;
const resendLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	limit: RESEND_LIMIT,
	skipFailedRequests: true,
	keyGenerator: (req) => `email-resend:${req.person?.id}`,
	handler: (req, res) => RateLimitExceeded(req, res, `You can send ${RESEND_LIMIT} new codes an hour. Check your spam folder, or wait and try again.`),
});

router.route('/').get(ValidateRequest, show).openapi = {
	summary: 'Get profile',
	description: 'The logged-in person\'s name, contact details, address, time zone and email preferences. Allowed while su\'d',
	path: '/user/profile',
	operationId: 'UserProfile',
	tags: ['Orval', 'user:profile'],
	responses: {
		200: {
			description: 'The profile',
			content: {
				'application/json': {
					schema: UserProfileSchema,
				},
			},
		},
		404: { $ref: '#/components/responses/NotFound' },
	},
};

router.route('/').patch(ValidateRequest, passwordLimiter, update).openapi = {
	summary: 'Update profile',
	description: `Saves the fields sent and leaves the rest as they are; one invalid field saves nothing. A phone, ZIP or postal code that is sent is checked against the country the profile will have after the save; stored values are not re-checked when only the country changes. A phone number on another account is 409. While a password change is required, every save is 403. A new email needs currentPassword (wrong is 403, ${PASSWORD_LIMIT} wrong in 15 minutes is 429) and is 409 when another account has it; it starts unconfirmed, a code goes to the new address, and a notice to the old one. Allowed while su'd, except an email change (403)`,
	path: '/user/profile',
	operationId: 'UserProfileUpdate',
	tags: ['Orval', 'user:profile'],
	requestBody: {
		content: {
			'application/json': {
				schema: UserProfileUpdateSchema,
			},
		},
	},
	responses: {
		200: {
			description: 'The profile as saved',
			content: {
				'application/json': {
					schema: UserProfileSchema,
				},
			},
		},
		400: { $ref: '#/components/responses/BadRequest' },
		403: { $ref: '#/components/responses/Forbidden' },
		404: { $ref: '#/components/responses/NotFound' },
		409: { $ref: '#/components/responses/Conflict' },
		429: { $ref: '#/components/responses/TooManyRequests' },
	},
};

router.route('/email/confirm').post(ValidateRequest, confirmLimiter, confirmEmail).openapi = {
	summary: 'Confirm email with a code',
	description: `Checks the code from the confirmation email, in any case. A right code confirms the address and turns email back on; an address already confirmed answers the same. A code over 7 days old is 410. ${CONFIRM_LIMIT} wrong codes in 15 minutes is 429. Allowed while su'd`,
	path: '/user/profile/email/confirm',
	operationId: 'UserEmailConfirm',
	tags: ['Orval', 'user:profile'],
	requestBody: {
		content: {
			'application/json': {
				schema: EmailConfirmRequestSchema,
			},
		},
	},
	responses: {
		204: { description: 'The address is confirmed' },
		400: { $ref: '#/components/responses/BadRequest' },
		404: { $ref: '#/components/responses/NotFound' },
		410: { $ref: '#/components/responses/Gone' },
		429: { $ref: '#/components/responses/TooManyRequests' },
	},
};

router.route('/email/resend').post(ValidateRequest, resendLimiter, resendEmailConfirmation).openapi = {
	summary: 'Send a new confirmation code',
	description: `Emails a new code and link to the person's current address, even if they have turned email off. The earlier code and link stop working. ${RESEND_LIMIT} sends an hour. Allowed while su'd`,
	path: '/user/profile/email/resend',
	operationId: 'UserEmailResend',
	tags: ['Orval', 'user:profile'],
	responses: {
		202: { description: 'A new code is on its way' },
		404: { $ref: '#/components/responses/NotFound' },
		409: { $ref: '#/components/responses/Conflict' },
		429: { $ref: '#/components/responses/TooManyRequests' },
	},
};

export default router;
