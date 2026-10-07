import { Router } from 'express';
import z from 'zod';
import { requireAccess } from '../../../../../../middleware/auth/authorization.js';
import { getTournDashboard, getTournAttendance, postTournAttendance } from '../../../../../../controllers/tab/all/dashboard.js';
import { eventCheckin, categoryCheckin } from '../../../../../../controllers/tab/all/checkin.js';
import { searchAttendees } from '../../../../../../controllers/tab/all/search.js';

const router = Router({mergeParams: true});

const tournParams = z.object({
	tournId: z.coerce.number().int().positive(),
});

router.route('/dashboard').get(requireAccess('tourn', 'read'), getTournDashboard).openapi = {
	path: '/tab/tourns/{tournId}/all/dashboard',
	summary: 'Get tournament dashboard',
	operationId: 'tabTournAllDashboard',
	tags: ['legacy', 'Tournament'],
	requestParams: { path: tournParams },
	responses: { 200: { description: 'Dashboard data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/attendance')
	.get(requireAccess('tourn', 'read'), getTournAttendance)
	.post(requireAccess('tourn', 'write'), postTournAttendance)
	.openapi = {
		path: '/tab/tourns/{tournId}/all/attendance',
		tags: ['legacy', 'Tournament'],
		requestParams: { path: tournParams },
		get: {
			summary: 'Get tournament attendance',
			operationId: 'tabTournAllAttendance',
			responses: { 200: { description: 'Attendance data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
		},
		post: {
			summary: 'Update tournament attendance',
			operationId: 'postTabTournAllAttendance',
			responses: { 200: { description: 'Attendance updated' }, default: { $ref: '#/components/responses/ErrorResponse' } },
		},
	};

router.route('/category/:categoryId/checkin').post(requireAccess('category', 'write'), categoryCheckin).openapi = {
	path: '/tab/tourns/{tournId}/all/category/{categoryId}/checkin',
	summary: 'Check in category',
	operationId: 'tabTournAllCategoryCheckin',
	tags: ['legacy', 'Tournament'],
	requestParams: {
		path: tournParams.extend({ categoryId: z.coerce.number().int().positive() }),
	},
	responses: { 200: { description: 'Category checked in' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/event/:eventId/checkin').post(requireAccess('event', 'write'), eventCheckin).openapi = {
	path: '/tab/tourns/{tournId}/all/event/{eventId}/checkin',
	summary: 'Check in event',
	operationId: 'tabTournAllEventCheckin',
	tags: ['legacy', 'Tournament'],
	requestParams: {
		path: tournParams.extend({ eventId: z.coerce.number().int().positive() }),
	},
	responses: { 200: { description: 'Event checked in' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/search/:searchString').get(requireAccess('tourn', 'read'), searchAttendees).openapi = {
	path: '/tab/tourns/{tournId}/all/search/{searchString}',
	summary: 'Search tournament attendees',
	operationId: 'tabTournAllSearch',
	tags: ['legacy', 'Tournament'],
	requestParams: {
		path: tournParams.extend({ searchString: z.string() }),
	},
	responses: { 200: { description: 'Matching attendees' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
