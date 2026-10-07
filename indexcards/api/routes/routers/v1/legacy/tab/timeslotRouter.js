import { Router } from 'express';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';
import { blastTimeslotMessage, blastTimeslotPairings, messageFreeJudges } from '../../../../../controllers/tab/timeslot/blast.js';
import { getTournDashboard, getTournAttendance } from '../../../../../controllers/tab/all/dashboard.js';
import z from 'zod';

const router = Router();

router.post('/:timeslotId/blast', requireAccess('timeslot', 'write'), blastTimeslotPairings).openapi = {
	path: '/tab/timeslot/{timeslotId}/blast',
	tags: ['legacy', 'Timeslot'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Blast sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.post('/:timeslotId/message', requireAccess('timeslot', 'write'), blastTimeslotMessage).openapi = {
	path: '/tab/timeslot/{timeslotId}/message',
	tags: ['legacy', 'Timeslot'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Message sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.post('/:timeslotId/message/free', requireAccess('timeslot', 'write'), messageFreeJudges).openapi = {
	path: '/tab/timeslot/{timeslotId}/message/free',
	tags: ['legacy', 'Timeslot'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Free judges message sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.get('/:timeslotId/dashboard', requireAccess('timeslot', 'read'), getTournDashboard).openapi = {
	path: '/tab/timeslot/{timeslotId}/dashboard',
	tags: ['legacy', 'Timeslot Dashboard'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Dashboard data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.get('/:timeslotId/attendance', requireAccess('timeslot', 'read'), getTournAttendance).openapi = {
	path: '/tab/timeslot/{timeslotId}/attendance',
	tags: ['legacy', 'Timeslot Attendance'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Attendance data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
