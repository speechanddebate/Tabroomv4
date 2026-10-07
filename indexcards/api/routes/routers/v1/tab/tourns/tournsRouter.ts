import { Router } from 'express';
import { Backup } from '../../../../../controllers/tab/tourn/backup.js';
import tournController from '../../../../../controllers/tab/tournsController.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import categoriesRouter from './categoriesRouter.js';
import schoolsRouter from './schoolsRouter.js';
import sitesRouter from './sitesRouter.js';
import timeslotsRouter from './timeslotsRouter.js';
import { loadTournAuthContext } from '../../../../../middleware/auth/authContext.js';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';

import legacyAllRouter from './legacy/allRouter.js';
import legacyRoundRouter from './legacy/roundRouter.js';
import { BackupRequestSchema, TournRequestSchema, TournSchema } from '@tabroom/types';
import config from '../../../../../config.js';
import z from 'zod';

const router = Router({mergeParams: true });

router.param('tournId', loadTournAuthContext);

router.route('/').post(ValidateRequest,tournController.createTourn).openapi = {
	path: '/tab/tourns',
	summary: 'Create tournament',
	tags: ['tab:tournament'],
	requestBody: {
		content: {
			'application/json': {
				schema: TournRequestSchema
			},
		},
		required: true,
	},
	responses: {
		201: {
			description: 'Tournament created',
			content: {
				'application/json': {
					schema: TournSchema,
				},
			},
		},
	},
};

router.route('/:tournId').get(requireAccess('tourn', 'read'), ValidateRequest, tournController.getTourn).openapi = {
	path: '/tab/tourns/{tournId}',
	summary: 'Get tournament',
	tags: ['tab:tournament'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
	responses: {
		200: {
			description: 'Tournament information',
			content: {
				'application/json': {
					schema: TournSchema,
				},
			},
		},
		404: { $ref: '#/components/responses/NotFound' },
	},
};

router.route('/:tournId').put(requireAccess('tourn', 'update'), ValidateRequest, tournController.updateTourn).openapi = {
	path: '/tab/tourns/{tournId}',
	summary: 'Update tournament',
	tags: ['tab:tournament'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
	requestBody: {
		content: {
			'application/json': {
				schema: TournRequestSchema.partial(),
			},
		},
		required: true,
	},
};

router.route('/:tournId').delete(requireAccess('tourn', 'owner'), ValidateRequest, tournController.deleteTourn).openapi = {
	path: '/tab/tourns/{tournId}',
	summary: 'Delete tournament',
	tags: ['tab:tournament'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
};
if (!config.features.HIDE_DEV_ENDPOINTS)
	router.route('/:tournId/backup').post(requireAccess('tourn', 'read'), ValidateRequest, Backup).openapi = {
	path: '/tab/tourns/{tournId}/backup',
	summary: 'Tournament Backup',
	description: 'Creates a backup dump of the tournament data in JSON format',
	tags: ['tab:backup-restore'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
	requestBody: {
		description: 'Parameters for the backup request',
		required: true,
		content: {
			'application/json': {
				schema: BackupRequestSchema,
			},
		},
	},
	responses: {
		200: { description: 'Backup data' },
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};

router.use('/:tournId/categories', categoriesRouter);
router.use('/:tournId/schools', schoolsRouter);
router.use('/:tournId/sites', sitesRouter);
router.use('/:tournId/timeslots', timeslotsRouter);

router.use('/:tournId/all', legacyAllRouter);
router.use('/:tournId/rounds', legacyRoundRouter);

export default router;