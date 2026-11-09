import { Router } from 'express';
import { OnlineRoomJoinSchema, ProblemSchema, RoomViewSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../../config.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import { requirePerson } from '../../../../../middleware/auth/authorization.js';
import { getSectionRoom, joinSectionRoom } from '../../../../../controllers/rest/onlineRoomsController.js';

// /rest/tourns/:tournId/sections
// Who can see a section's room (judges, competitors, observing coaches, tab) is up to the service
const router = Router({ mergeParams: true });

router.use(requirePerson);

const sectionParams = z.object({
	tournId: z.coerce.number().int().positive().meta({ description: 'ID of the tournament' }),
	sectionId: z.coerce.number().int().positive().meta({ description: 'ID of the section (panel)' }),
});

const roomQuery = z.object({
	observer: z.coerce.number().int().positive().optional().meta({ description: 'ID of an entry in the section the person is observing as its coach' }),
});

if(!config.features.HIDE_DEV_ENDPOINTS) {
router.route('/:sectionId/room')
	.get(ValidateRequest, getSectionRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/sections/{sectionId}/room',
		tags: ['Orval', 'Room'],
		requestParams: { path: sectionParams, query: roomQuery },
		get: {
			summary: 'Get section room',
			description: 'The section\'s online room as the person sees it: whether they can join, and the room to show if not',
			operationId: 'RestTournsSectionsRoomGet',
			responses: {
				200: {
					description: 'The online room',
					content: { 'application/json': { schema: RoomViewSchema } },
				},
				400: { $ref: '#/components/responses/BadRequest' },
				404: { $ref: '#/components/responses/NotFound' },
			},
		},
	};

// Logs the join and returns what to open, so a Campus token is never issued without a log
router.route('/:sectionId/room/join')
	.post(ValidateRequest, joinSectionRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/sections/{sectionId}/room/join',
		tags: ['Orval', 'Room'],
		requestParams: { path: sectionParams, query: roomQuery },
		post: {
			summary: 'Join section room',
			description: 'Logs the join and returns the link to open, or for NSDA Campus the signed token to post to it',
			operationId: 'RestTournsSectionsRoomJoin',
			responses: {
				201: {
					description: 'What to open',
					content: { 'application/json': { schema: OnlineRoomJoinSchema } },
				},
				400: { $ref: '#/components/responses/BadRequest' },
				404: { $ref: '#/components/responses/NotFound' },
				409: { $ref: '#/components/responses/Conflict' },
				503: {
					description: 'NSDA Campus isn\'t configured, so Campus rooms can\'t be joined',
					content: { 'application/problem+json': { schema: ProblemSchema } },
				},
			},
		},
	};
}

export default router;
