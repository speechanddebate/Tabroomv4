import { Router } from 'express';
import z from 'zod';
import { ValidateRequest } from '../../../../middleware/validation.js';
import { add, list, remove, searchChapters, searchPeople } from '../../../../controllers/user/conflictsController.js';
import { ConflictChapterMatchSchema, ConflictPersonMatchSchema, StandingConflictRequestSchema, StandingConflictSchema } from '@tabroom/types';

// /v1/user/conflicts: the logged-in person's standing conflicts. requirePerson is on the /user mount
const router = Router();

router.route('/').get(ValidateRequest, list).openapi = {
	summary: 'List standing conflicts',
	description: "The people and chapters the logged-in person must not judge or be judged by, at any tournament",
	path: '/user/conflicts',
	operationId: 'UserConflicts',
	tags: ['Orval', 'user:conflicts'],
	responses: {
		200: {
			description: 'The standing conflicts, chapters first',
			content: {
				'application/json': {
					schema: z.array(StandingConflictSchema),
				},
			},
		},
	},
};

router.route('/').post(ValidateRequest, add).openapi = {
	summary: 'Add a standing conflict',
	description: 'Records a person or a chapter as a standing conflict and marks the conflicts it implies at every tournament of theirs that has not ended. A repeat or a self-conflict is 409 with a reason of duplicate or self',
	path: '/user/conflicts',
	operationId: 'UserConflictAdd',
	tags: ['Orval', 'user:conflicts'],
	requestBody: {
		content: {
			'application/json': {
				schema: StandingConflictRequestSchema,
			},
		},
	},
	responses: {
		201: {
			description: 'The standing conflict as listed',
			content: {
				'application/json': {
					schema: StandingConflictSchema,
				},
			},
		},
		400: { $ref: '#/components/responses/BadRequest' },
		404: { $ref: '#/components/responses/NotFound' },
		409: { $ref: '#/components/responses/Conflict' },
	},
};

router.route('/people').get(ValidateRequest, searchPeople).openapi = {
	summary: 'Find people for a standing conflict',
	description: 'People by last name and first name prefix, or by exact email. A last name or an email is required',
	path: '/user/conflicts/people',
	operationId: 'UserConflictsPeople',
	tags: ['Orval', 'user:conflicts'],
	requestParams: {
		query: z.object({
			last: z.string().trim().max(63).optional().meta({ description: 'Last name prefix' }),
			first: z.string().trim().max(63).optional().meta({ description: 'First name prefix' }),
			email: z.email().optional().meta({ description: 'Exact email' }),
		}),
	},
	responses: {
		200: {
			description: 'Up to 25 matches',
			content: {
				'application/json': {
					schema: z.array(ConflictPersonMatchSchema),
				},
			},
		},
		400: { $ref: '#/components/responses/BadRequest' },
	},
};

router.route('/chapters').get(ValidateRequest, searchChapters).openapi = {
	summary: 'Find chapters for a standing conflict',
	description: 'Chapters by name prefix',
	path: '/user/conflicts/chapters',
	operationId: 'UserConflictsChapters',
	tags: ['Orval', 'user:conflicts'],
	requestParams: {
		query: z.object({
			name: z.string().trim().min(2).max(127).meta({ description: 'Name prefix, at least two characters' }),
		}),
	},
	responses: {
		200: {
			description: 'Up to 25 matches',
			content: {
				'application/json': {
					schema: z.array(ConflictChapterMatchSchema),
				},
			},
		},
		400: { $ref: '#/components/responses/BadRequest' },
	},
};

router.route('/:conflictId').delete(ValidateRequest, remove).openapi = {
	summary: 'Remove a standing conflict',
	description: 'Removes one of the person\'s standing conflicts and the tournament conflicts it derived at tournaments that have not ended',
	path: '/user/conflicts/{conflictId}',
	operationId: 'UserConflictRemove',
	tags: ['Orval', 'user:conflicts'],
	requestParams: {
		path: z.object({
			conflictId: z.coerce.number().int().positive().meta({ description: 'ID of the standing conflict' }),
		}),
	},
	responses: {
		204: { description: 'Removed' },
		400: { $ref: '#/components/responses/BadRequest' },
		404: { $ref: '#/components/responses/NotFound' },
	},
};

export default router;
