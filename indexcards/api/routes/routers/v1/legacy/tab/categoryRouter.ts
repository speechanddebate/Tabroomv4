import { Router } from 'express';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';
import { getAccess,createAccess,updateAccess,deleteAccess } from '../../../../../controllers/tab/category/access.js';
import { updateCategoryLearn } from '../../../../../controllers/tab/category/learn.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import z from 'zod';
const router = Router();

router.route('/:categoryId/access/:personId')
	.all(requireAccess('category', 'write'), ValidateRequest)
    .get(getAccess)
    .put(updateAccess)
    .delete(deleteAccess)
    .post(createAccess).openapi = {
	path: '/tab/category/{categoryId}/access/{personId}',
	tags: ['legacy', 'Category Access'],
	requestParams: {
		path: z.object({
			categoryId: z.coerce.number().int().positive(),
			personId: z.coerce.number().int().positive(),
		}),
	},
	get: { responses: { 200: { description: 'Access info' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	put: { responses: { 200: { description: 'Access updated' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	delete: { responses: { 200: { description: 'Access deleted' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
	post: { responses: { 201: { description: 'Access created' }, default: { $ref: '#/components/responses/ErrorResponse' } } },
};

router.route('/:categoryId/updateLearn').post(requireAccess('category', 'write'), ValidateRequest, updateCategoryLearn).openapi = {
	path: '/tab/category/{categoryId}/updateLearn',
	tags: ['legacy', 'Category'],
	requestParams: {
		path: z.object({
			categoryId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Learn courses updated' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
