import { Router } from 'express';
import { requireAccess } from '../../../../../middleware/auth/authorization.js';
import { blastTimeslotMessage, blastTimeslotPairings, messageFreeJudges } from '../../../../../controllers/tab/timeslot/blast.js';
import { getTournDashboard, getTournAttendance } from '../../../../../controllers/tab/all/dashboard.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import z from 'zod';

const router = Router();

router.route('/:timeslotId/blast').post(requireAccess('timeslot', 'write'), ValidateRequest, blastTimeslotPairings).openapi = {
	path: '/tab/timeslot/{timeslotId}/blast',
	tags: ['legacy', 'Timeslot'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Blast sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.route('/:timeslotId/message').post(requireAccess('timeslot', 'write'), ValidateRequest, blastTimeslotMessage).openapi = {
	path: '/tab/timeslot/{timeslotId}/message',
	tags: ['legacy', 'Timeslot'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Message sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.route('/:timeslotId/message/free').post(requireAccess('timeslot', 'write'), ValidateRequest, messageFreeJudges).openapi = {
	path: '/tab/timeslot/{timeslotId}/message/free',
	tags: ['legacy', 'Timeslot'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Free judges message sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.route('/:timeslotId/dashboard').get(requireAccess('timeslot', 'read'), ValidateRequest, getTournDashboard).openapi = {
	path: '/tab/timeslot/{timeslotId}/dashboard',
	tags: ['legacy', 'Timeslot Dashboard'],
	requestParams: {
		path: z.object({
			timeslotId: z.coerce.number().int().positive(),
		}),
	},
	responses: { 200: { description: 'Dashboard data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
router.route('/:timeslotId/attendance').get(requireAccess('timeslot', 'read'), ValidateRequest, getTournAttendance).openapi = {
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
