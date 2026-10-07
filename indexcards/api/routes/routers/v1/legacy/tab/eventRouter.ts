import { Router } from 'express';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';
import { updateEvent } from '../../../../../controllers/tab/event/index.js';
import { sectionTemplateRobin } from '../../../../../controllers/tab/event/roundrobin.js';
import * as accessController from '../../../../../controllers/tab/event/access.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import z from 'zod';

const router = Router();

router.route('/:eventId').get(requireAccess('event', 'read'), ValidateRequest, updateEvent).openapi = {
	path: '/tab/event/{eventId}',
	tags: ['legacy', 'Event'],
	requestParams: {
		path: z.object({
			eventId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Event' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:eventId/access/:personId')
    .get(requireAccess('event', 'write'), ValidateRequest, accessController.getAccess)
    .put(requireAccess('event', 'write'), ValidateRequest, accessController.updateAccess)
    .delete(requireAccess('event', 'write'), ValidateRequest, accessController.deleteAccess)
    .post(requireAccess('event', 'write'), ValidateRequest, accessController.createAccess).openapi = {
	path: '/tab/event/{eventId}/access/{personId}',
	tags: ['legacy', 'Event Access'],
	requestParams: {
		path: z.object({
			eventId: z.coerce.number().int().positive(),
			personId: z.coerce.number().int().positive(),
		}),
	},
	get: { responses: { 200: { description: 'Access info' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	put: { responses: { 200: { description: 'Access updated' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	delete: { responses: { 200: { description: 'Access deleted' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	post: { responses: { 201: { description: 'Access created' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
};

router.route('/:eventId/backupAccess/:personId')
	.post(requireAccess('event', 'write'), ValidateRequest, accessController.createBackupAccess)
	.delete(requireAccess('event', 'write'), ValidateRequest, accessController.deleteBackupAccess).openapi = {
	path: '/tab/event/{eventId}/backupAccess/{personId}',
	tags: ['legacy', 'Event Access'],
	requestParams: {
		path: z.object({
			eventId: z.coerce.number().int().positive(),
			personId: z.coerce.number().int().positive(),
		}),
	},
	post: { responses: { 201: { description: 'Backup access created' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	delete: { responses: { 200: { description: 'Backup access deleted' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
};

router.route('/:eventId/section/robin/template').post(requireAccess('event', 'write'), ValidateRequest, sectionTemplateRobin).openapi = {
	path: '/tab/event/{eventId}/section/robin/template',
	tags: ['legacy', 'Event'],
	requestParams: {
		path: z.object({
			eventId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Round robin template section created' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
