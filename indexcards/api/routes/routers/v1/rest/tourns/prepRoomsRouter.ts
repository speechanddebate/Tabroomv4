import { Router } from 'express';
import { OnlineRoomJoinSchema, OnlineRoomSchema, ProblemSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../../config.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import { requirePerson } from '../../../../../middleware/auth/authorization.js';
import { getEntryPrepRoom, joinEntryPrepRoom } from '../../../../../controllers/rest/onlineRoomsController.js';

// /rest/tourns/:tournId/prep-rooms
// An entry's prep room, keyed by the entry. Who can see it (the entry's students, their coaches, tab) is up to the service
const router = Router({ mergeParams: true });

router.use(requirePerson);

const prepRoomParams = z.object({
	tournId: z.coerce.number().int().positive().meta({ description: 'ID of the tournament' }),
	entryId: z.coerce.number().int().positive().meta({ description: 'ID of the entry' }),
});

if(!config.features.HIDE_DEV_ENDPOINTS) {
router.route('/:entryId')
	.get(ValidateRequest, getEntryPrepRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/prep-rooms/{entryId}',
		tags: ['Orval', 'Room'],
		requestParams: { path: prepRoomParams },
		get: {
			summary: 'Get entry prep room',
			description: 'The entry\'s NSDA Campus prep room, for events that use them',
			operationId: 'RestTournsPrepRoomsGet',
			responses: {
				200: {
					description: 'The prep room',
					content: { 'application/json': { schema: OnlineRoomSchema } },
				},
				400: { $ref: '#/components/responses/BadRequest' },
				404: { $ref: '#/components/responses/NotFound' },
			},
		},
	};

// Logs the join and returns the Campus token to post
router.route('/:entryId/join')
	.post(ValidateRequest, joinEntryPrepRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/prep-rooms/{entryId}/join',
		tags: ['Orval', 'Room'],
		requestParams: { path: prepRoomParams },
		post: {
			summary: 'Join entry prep room',
			description: 'Logs the join and returns the signed NSDA Campus token to post',
			operationId: 'RestTournsPrepRoomsJoin',
			responses: {
				201: {
					description: 'What to open',
					content: { 'application/json': { schema: OnlineRoomJoinSchema } },
				},
				400: { $ref: '#/components/responses/BadRequest' },
				404: { $ref: '#/components/responses/NotFound' },
				503: {
					description: 'NSDA Campus isn\'t configured, so Campus rooms can\'t be joined',
					content: { 'application/problem+json': { schema: ProblemSchema } },
				},
			},
		},
	};
}

export default router;
