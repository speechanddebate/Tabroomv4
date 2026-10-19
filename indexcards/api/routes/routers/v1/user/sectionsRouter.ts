import { Router } from 'express';
import { OnlineRoomJoinSchema, OnlineRoomSchema, ProblemSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../config.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import { loadSectionAuthContext } from '../../../../middleware/auth/authContext.js';
import { getSectionRoom, joinSectionRoom } from '../../../../controllers/user/onlineRoomsController.js';

// /user/sections
const router = Router();

router.param('sectionId', loadSectionAuthContext);

const sectionParams = z.object({
	sectionId: z.coerce.number().int().positive().meta({ description: 'ID of the section (panel)' }),
});

const roomQuery = z.object({
	observer: z.coerce.number().int().positive().optional().meta({ description: 'ID of an entry in the section the person is observing as its coach' }),
});

if(!config.features.HIDE_DEV_ENDPOINTS) {
// Who can see the room (judges, competitors, observing coaches, tab) is up to the service
router.route('/:sectionId/room')
	.get(ValidateRequest, getSectionRoom)
	.openapi = {
		path: '/user/sections/{sectionId}/room',
		tags: ['Orval', 'OnlineRoom'],
		get: {
			summary: 'Get section room',
			description: 'The section\'s online room as the person sees it: whether they can join, and the room to show if not',
			operationId: 'UserSectionsRoomGet',
			// requestParams isn't merged with a shared one, so path params are declared here
			requestParams: { path: sectionParams, query: roomQuery },
			responses: {
				200: {
					description: 'The online room',
					content: { 'application/json': { schema: OnlineRoomSchema } },
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
		path: '/user/sections/{sectionId}/room/join',
		tags: ['Orval', 'OnlineRoom'],
		post: {
			summary: 'Join section room',
			description: 'Logs the join and returns the link to open, or for NSDA Campus the signed token to post to it',
			operationId: 'UserSectionsRoomJoin',
			requestParams: { path: sectionParams, query: roomQuery },
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
