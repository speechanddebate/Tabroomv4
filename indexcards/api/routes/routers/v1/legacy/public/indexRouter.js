import Router from 'express';
import { searchTourns, searchCircuitTourns } from '../../../../../controllers/public/search.js';
import z from 'zod';

const router = Router();

router.get('/search/:time/:searchString/circuit/:circuitId', searchCircuitTourns).openapi = {
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
router.get('/search/:time/:searchString', searchTourns).openapi = {
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