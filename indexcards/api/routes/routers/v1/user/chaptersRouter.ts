import { Router } from 'express';
import controller from '../../../../controllers/user/chapter/index.js';
import { MySchoolSchema, NonTournChapterSchema, UserChapterSchema } from '@tabroom/types';
import z from 'zod';
import config from '../../../../config.js';
import { ValidateRequest } from '../../../../middleware/validation.js';

const router = Router();

router.route('/')
	.get(controller.userChapters).openapi = {
		path: '/user/chapters',
		summary: 'GET User Chapters',
		description: 'returns a list of chapters a person has permissions in.',
		operationId: 'UserChapters',
		tags: ['Orval', 'User: Chapter'],
		responses: {
			200: {
				description: 'User chapters',
				content: {
					'application/json': {
						schema: z.array(UserChapterSchema),
					},
				},
			},
		}
	};

if(!config.features.HIDE_DEV_ENDPOINTS) {
router.route('/byTourn/:tournId')
	.get(ValidateRequest, controller.userChaptersByTourn).openapi = {
	path: '/user/chapters/byTourn/{tournId}',
	tags: ['legacy', 'User: Chapter'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
	responses: { 200: { description: 'Chapters by tournament' }, default: { $ref: '#/components/responses/ErrorResponse' } },
};
}
router.route('/byTourn/:tournId/mySchools')
	.get(ValidateRequest, controller.getMySchoolsByTourn).openapi = {
	path: '/user/chapters/byTourn/{tournId}/mySchools',
	tags: ['legacy', 'User: Chapter'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
	responses: {
		200: {
			description: 'My schools by tournament',
			content: { 'application/json': { schema: z.array(MySchoolSchema) } },
		},
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};
router.route('/byTourn/:tournId/nonSchools')
	.get(ValidateRequest, controller.getMyChaptersNonTourn).openapi = {
	path: '/user/chapters/byTourn/{tournId}/nonSchools',
	tags: ['legacy', 'User: Chapter'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
	},
	responses: {
		200: {
			description: 'Non-school chapters by tournament',
			content: { 'application/json': { schema: z.array(NonTournChapterSchema) } },
		},
		default: { $ref: '#/components/responses/ErrorResponse' },
	},
};

export default router;
