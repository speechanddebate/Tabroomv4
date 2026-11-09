import { Router } from 'express';
import { OnlineRoomJoinSchema, ProblemSchema, RoomViewSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../../config.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import { requirePerson } from '../../../../../middleware/auth/authorization.js';
import { getSchoolRoom, joinSchoolRoom } from '../../../../../controllers/rest/onlineRoomsController.js';

// /rest/tourns/:tournId/schools
// Who can see a school's squad room (coaches, students, tab) is up to the service
const router = Router({ mergeParams: true });

router.use(requirePerson);

const schoolParams = z.object({
	tournId: z.coerce.number().int().positive().meta({ description: 'ID of the tournament' }),
	schoolId: z.coerce.number().int().positive().meta({ description: 'ID of the school' }),
});

if(!config.features.HIDE_DEV_ENDPOINTS) {
router.route('/:schoolId/room')
	.get(ValidateRequest, getSchoolRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/schools/{schoolId}/room',
		tags: ['Orval', 'Room'],
		requestParams: { path: schoolParams },
		get: {
			summary: 'Get school squad room',
			description: 'The school\'s NSDA Campus squad room, for its coaches and students',
			operationId: 'RestTournsSchoolsRoomGet',
			responses: {
				200: {
					description: 'The squad room',
					content: { 'application/json': { schema: RoomViewSchema } },
				},
				400: { $ref: '#/components/responses/BadRequest' },
				404: { $ref: '#/components/responses/NotFound' },
			},
		},
	};

// Logs the join and returns the Campus token to post
router.route('/:schoolId/room/join')
	.post(ValidateRequest, joinSchoolRoom)
	.openapi = {
		path: '/rest/tourns/{tournId}/schools/{schoolId}/room/join',
		tags: ['Orval', 'Room'],
		requestParams: { path: schoolParams },
		post: {
			summary: 'Join school squad room',
			description: 'Logs the join and returns the signed NSDA Campus token to post',
			operationId: 'RestTournsSchoolsRoomJoin',
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
