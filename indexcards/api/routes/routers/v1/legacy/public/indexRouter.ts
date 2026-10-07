import { Router } from 'express';
import { searchTourns, searchCircuitTourns } from '../../../../../controllers/public/search.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import z from 'zod';

const router = Router();

router.route('/search/:time/:searchString/circuit/:circuitId').get(ValidateRequest, searchCircuitTourns).openapi = {
	path: '/public/search/{time}/{searchString}/circuit/{circuitId}',
	summary: 'Search circuit tournaments',
	tags: ['legacy', 'Public Search'],
	requestParams: {
		path: z.object({
			time: z.string(),
			searchString: z.string(),
			circuitId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Circuit tournaments' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.route('/search/:time/:searchString').get(ValidateRequest, searchTourns).openapi = {
	path: '/public/search/{time}/{searchString}',
	summary: 'Search tournaments',
	tags: ['legacy', 'Public Search'],
	requestParams: {
		path: z.object({
			time: z.string(),
			searchString: z.string(),
		}),
	},
	responses: { 200: { description: 'Tournaments' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;