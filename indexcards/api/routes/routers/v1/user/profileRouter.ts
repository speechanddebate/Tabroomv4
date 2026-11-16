import { Router } from 'express';
import { UserProfileSchema, UserProfileUpdateSchema } from '@tabroom/types';
import { ValidateRequest } from '../../../../middleware/validation.js';
import { show, update } from '../../../../controllers/user/profile.js';

const router = Router();

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

router.route('/').patch(ValidateRequest, update).openapi = {
	summary: 'Update profile',
	description: 'Saves the fields sent and leaves the rest as they are; one invalid field saves nothing. A phone, ZIP or postal code that is sent is checked against the country the profile will have after the save; stored values are not re-checked when only the country changes. A phone number on another account is 409. While a password change is required, every save is 403. Allowed while su\'d',
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
	},
};

export default router;
