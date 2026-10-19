import { Router } from 'express';
import { OnlineRoomSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../config.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import { loadSectionAuthContext } from '../../../../middleware/auth/authContext.js';
import { getSectionRoom } from '../../../../controllers/user/onlineRoomsController.js';

// /user/sections
const router = Router();

router.param('sectionId', loadSectionAuthContext);

const sectionParams = z.object({
	sectionId: z.coerce.number().int().positive().meta({ description: 'ID of the section (panel)' }),
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
			requestParams: {
				path: sectionParams,
				query: z.object({
					observer: z.coerce.number().int().positive().optional().meta({ description: 'ID of an entry in the section the person is observing as its coach' }),
				}),
			},
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
}

export default router;
