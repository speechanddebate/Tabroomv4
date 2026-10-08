import { Router } from 'express';
import * as controller from '../../../../controllers/admin/serverController.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import z from 'zod';

const router = Router();

router.route('/usage').get(controller.getTabroomUsage).openapi = {
	path: '/admin/servers/usage',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/show').get(controller.getInstances).openapi = {
	path: '/admin/servers/show',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/show/:linodeId').get(ValidateRequest, controller.getTabroomInstance).openapi = {
	path: '/admin/servers/show/{linodeId}',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	requestParams: {
		path: z.object({ linodeId: z.coerce.number().int().positive() }),
	},
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/status').get(controller.getInstanceStatus).openapi = {
	path: '/admin/servers/status',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/count').get(controller.getTabroomInstanceCounts).openapi = {
	path: '/admin/servers/count',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/reboot').post(controller.rebootInstance).openapi = {
	path: '/admin/servers/reboot',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/changeCount').post(ValidateRequest, controller.changeInstanceCount).openapi = {
	path: '/admin/servers/changeCount',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	requestBody: {
		required: true,
		content: {
			'application/json': {
				schema: z.object({
					target: z.int().nonnegative().meta({ description: 'Number of servers to add' }),
				}),
			},
		},
	},
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

router.route('/changeCount/:target').delete(ValidateRequest, controller.changeInstanceCount).openapi = {
	path: '/admin/servers/changeCount/{target}',
	summary: 'TODO write spec',
	tags: ['admin:servers'],
	requestParams: {
		path: z.object({
			target: z.coerce.number().int().nonnegative().meta({ description: 'Number of servers to remove' }),
		}),
	},
	responses: {
		'200': {
			description: 'OK',
		},
		'401' : { $ref: '#/components/responses/Unauthorized' },
	},
};

export default router;