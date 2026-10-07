import { Router } from 'express';
import z from 'zod';
import { requireAccess } from '../../../../../../middleware/auth/authorization.js';
import { sideCounts, roundDecisionStatus } from '../../../../../../controllers/tab/round/index.js';
import { getRoundChangeLog } from '../../../../../../controllers/tab/round/changeLog.js';
import {
	blastRoundPairing,
	blastRoundMessage,
	roundBlastStatus,
} from '../../../../../../controllers/tab/round/blast.js';
import { getTournDashboard, getTournAttendance } from '../../../../../../controllers/tab/all/dashboard.js';
import { makeShareRooms } from '../../../../../../controllers/tab/round/share.js';
import { mergeTimeslotRounds, unmergeTimeslotRounds } from '../../../../../../controllers/tab/round/merge.js';

const router = Router({ mergeParams: true });

const roundParams = z.object({
	tournId: z.coerce.number().int().positive(),
	roundId: z.coerce.number().int().positive(),
});

//LEGACY ROUTES

router.route('/:roundId/attendance').get(requireAccess('round', 'read'), getTournAttendance).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/attendance',
	summary: 'Get round attendance',
	operationId: 'tabTournRoundAttendance',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Attendance data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/blast').post(requireAccess('round', 'write'), blastRoundPairing).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/blast',
	summary: 'Blast round pairing',
	operationId: 'tabTournRoundBlast',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Blast sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/blastStatus').get(requireAccess('round', 'read'), roundBlastStatus).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/blastStatus',
	summary: 'Get round blast status',
	operationId: 'tabTournRoundBlastStatus',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Blast status' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/dashboard').get(requireAccess('round', 'read'), getTournDashboard).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/dashboard',
	summary: 'Get round dashboard',
	operationId: 'tabTournRoundDashboard',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Dashboard data' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/log').get(requireAccess('round', 'read'), getRoundChangeLog).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/log',
	summary: 'Get round change log',
	operationId: 'tabTournRoundLog',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Change log' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/makeShareRooms').post(requireAccess('round', 'write'), makeShareRooms).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/makeShareRooms',
	summary: 'Make share rooms',
	operationId: 'tabTournRoundMakeShareRooms',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Share rooms created' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/merge').post(requireAccess('round', 'write'), mergeTimeslotRounds).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/merge',
	summary: 'Merge timeslot rounds',
	operationId: 'tabTournRoundMerge',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Rounds merged' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/message').post(requireAccess('round', 'write'), blastRoundMessage).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/message',
	summary: 'Blast round message',
	operationId: 'tabTournRoundMessage',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Message sent' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/sidecount').get(requireAccess('round', 'read'), sideCounts).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/sidecount',
	summary: 'Get round side counts',
	operationId: 'tabTournRoundSidecount',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Side counts' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/status').get(requireAccess('round', 'read'), roundDecisionStatus).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/status',
	summary: 'Get round decision status',
	operationId: 'tabTournRoundStatus',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Decision status' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

router.route('/:roundId/unmerge').post(requireAccess('round', 'write'), unmergeTimeslotRounds).openapi = {
	path: '/tab/tourns/{tournId}/rounds/{roundId}/unmerge',
	summary: 'Unmerge timeslot rounds',
	operationId: 'tabTournRoundUnmerge',
	tags: ['legacy', 'tab:tournament'],
	requestParams: { path: roundParams },
	responses: { 200: { description: 'Rounds unmerged' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};

export default router;
