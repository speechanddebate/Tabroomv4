import { Router } from 'express';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';
import { restoreTourn } from '../../../../../controllers/tab/tourn/backup.js';
import * as accessController from '../../../../../controllers/tab/tourn/access.js';

import roundRouter from '../../tab/tourns/legacy/roundRouter.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import z from 'zod';

const router = Router({ mergeParams: true });

//router.post('/backup', backupTourn); moved to new router
router.route('/:tournId/restore').post(requireAccess('tourn', 'write'), ValidateRequest, restoreTourn).openapi = {
	path: '/tab/{tournId}/restore',
	summary: 'Restore tournament from backup',
	tags: ['legacy', 'Tournament'],
	requestParams: {
		path: z.object({
			tournId: z.coerce.number().int().positive(),
		}),
	},
	requestBody: {
		description: 'Tournament backup data',
		required: true,
		content: { 'application/json': { schema: { type: 'object' } } },
	},
	responses: { 200: { description: 'Tournament restored' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:tournId/access/:personId')
    .get(requireAccess('tourn', 'read'), ValidateRequest, accessController.getAccess)
    .post(requireAccess('tourn', 'write'), ValidateRequest, accessController.createAccess)
    .put(requireAccess('tourn', 'write'), ValidateRequest, accessController.updateAccess)
    .delete(requireAccess('tourn', 'write'), ValidateRequest, accessController.deleteAccess).openapi = {
	path: '/tab/{tournId}/access/{personId}',
	tags: ['legacy', 'Tournament Access'],
	requestParams: {
		path: z.object({
			tournId: z.coerce.number().int().positive(),
			personId: z.coerce.number().int().positive(),
		}),
	},
	get: { responses: { 200: { description: 'Access info' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	put: { responses: { 200: { description: 'Access updated' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	delete: { responses: { 200: { description: 'Access deleted' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	post: { responses: { 201: { description: 'Access created' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
};

router.route('/:tournId/backupAccess/:personId')
	.post(requireAccess('tourn', 'write'), ValidateRequest, accessController.createBackupAccess)
	.delete(requireAccess('tourn', 'write'), ValidateRequest, accessController.deleteBackupAccess).openapi = {
	path: '/tab/{tournId}/backupAccess/{personId}',
	tags: ['legacy', 'Tournament Access'],
	requestParams: {
		path: z.object({
			tournId: z.coerce.number().int().positive(),
			personId: z.coerce.number().int().positive(),
		}),
	},
	post: { responses: { 201: { description: 'Backup access created' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	delete: { responses: { 200: { description: 'Backup access deleted' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
};

router.use('/:tournId/rounds', roundRouter);

export default router;
