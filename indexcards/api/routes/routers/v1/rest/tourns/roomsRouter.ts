import { Router } from 'express';
import { OnlineRoomJoinSchema, ProblemSchema, TournRoomSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../../config.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import { requirePerson } from '../../../../../middleware/auth/authorization.js';
import { getUtilityRooms, joinUtilityRoom } from '../../../../../controllers/rest/onlineRoomsController.js';

// /rest/tourns/:tournId/rooms
// The tourn's utility rooms. Who sees each one is up to the service
const router = Router({ mergeParams: true });

router.use(requirePerson);

const tournParams = z.object({
	tournId: z.coerce.number().int().positive().meta({ description: 'ID of the tournament' }),
});

const roomParams = tournParams.extend({
	roomId: z.coerce.number().int().positive().meta({ description: 'ID of the utility room within the tournament' }),
});

if(!config.features.HIDE_DEV_ENDPOINTS) {
router.route('/')
	.get(ValidateRequest, getUtilityRooms)
	.openapi = {
		path: '/rest/tourns/{tournId}/rooms',
		tags: ['Orval', 'Room'],
		requestParams: { path: tournParams },
		get: {
			summary: 'List utility rooms',
			description: 'The tournament\'s utility rooms the person can see, such as a judge lounge or tab help desk',
			operationId: 'RestTournsRoomsList',
			responses: {
				200: {
					description: 'The utility rooms',
					content: { 'application/json': { schema: z.array(TournRoomSchema) } },
				},
				400: { $ref: '#/components/responses/BadRequest' },
				404: { $ref: '#/components/responses/NotFound' },
			},
		},
	};

// Logs the join and returns what to open
router.route('/:roomId/join')
	.post(ValidateRequest, joinUtilityRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/rooms/{roomId}/join',
		tags: ['Orval', 'Room'],
		requestParams: { path: roomParams },
		post: {
			summary: 'Join utility room',
			description: 'Logs the join and returns the link to open, or for NSDA Campus the signed token to post to it. '
				+ 'Utility room ids change when the tournament saves its rooms, so the body names the room expected at that id',
			operationId: 'RestTournsRoomJoin',
			requestBody: {
				content: {
					'application/json': {
						schema: z.object({
							name: TournRoomSchema.shape.name.unwrap().meta({ description: 'The name of the room, as listed' }),
						}),
					},
				},
			},
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
