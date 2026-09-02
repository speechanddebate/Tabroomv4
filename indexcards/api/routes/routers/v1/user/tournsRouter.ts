import { Router } from 'express';
import * as controller from '../../../../controllers/user/tourn/index.js';
import * as ballots from '../../../../controllers/user/tourn/ballotsController.js';
import { ValidateRequest } from '../../../../middleware/validation.js';
import z from 'zod';
import { FineSchema, CurrentBallotSchema, PersonTournSummarySchema, TournSchema } from '@tabroom/types';

const router = Router();

router.route('/').get(ValidateRequest,controller.getPersonTourns).openapi = {
	summary: 'Get Current Tourns',
	operationId: 'UserTourns',
	path : '/user/tourns',
	tags : ['User Tournament','Orval'],
	description: 'Returns an array of Tourns a person is involved in.',
	requestParams: {
		query: z.object({
			endAfter: z.iso.datetime().optional(),
		}),
	},
	responses: {
		200     : {
			description: 'Tourn Summary',
			content: {
				'application/json': {
					schema: z.array(TournSchema),
				},
			},
		},
	},
};
// User tourn presence
router.route('/:tournId').get(controller.getPersonTournPresence).openapi = {
	summary: 'Get Tournament Presence',
	operationId: 'UserTourn',
	path : '/user/tourns/{tournId}',
	tags : ['User Tournament'],
	description: 'Get a user connections to a tournament, if any',
	requestParams: {
		path: z.object({
			tournId: z.number().int().positive().meta({ description: 'ID of the tournament' }),
		}),
	},
	responses: {
		200     : { description: 'Person tournament presence' },
	},
};

router.route('/:tournId/summary').get(ValidateRequest,controller.getTournSummary).openapi = {
	summary: 'Get Summary',
	operationId: 'UserTournsSummary',
	path : '/user/tourns/{tournId}/summary',
	tags : ['User Tournament','Orval'],
	description: 'Returns a summary of a users role in a tourn.',
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() })
	},
	responses: {
		200     : {
			description: 'Summary',
			content: {
				'application/json': {
					schema: PersonTournSummarySchema,
				},
			},
		},
	},
};

router.route('/:tournId/fines').get(ValidateRequest,controller.getTournFines).openapi = {
	summary: 'Get Fines',
	operationId: 'UserTournsFines',
	path : '/user/tourns/{tournId}/fines',
	tags : ['User Tournament','Orval'],
	description: 'Returns an array of Fines for the tourn.',
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() })
	},
	responses: {
		200     : {
			description: 'Fines',
			content: {
				'application/json': {
					schema: z.array(FineSchema),
				},
			},
		},
	},
};

router.route('/:tournId/ballots').get(ValidateRequest,controller.getTournBallots).openapi = {
	summary: 'Get Ballots',
	operationId: 'UserTournsBallots',
	path : '/user/tourns/{tournId}/ballots',
	tags : ['User Tournament','Orval'],
	description: 'Returns an array of Fines for the tourn.',
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
		query: z.object({
			audited: z.boolean().default(false),
		})
	},
	responses: {
		200     : {
			description: 'Ballots',
			content: {
				'application/json': {
					schema: z.array(CurrentBallotSchema),
				},
			},
		},
	},
};

router.route('/:tournId/ballots/current')
	.get(ValidateRequest,ballots.getCurrent).openapi = {
		summary: "Get current ballots",
		path: "/user/tourns/{tournId}/ballots/current",
		operationId: "UserTournsBallotsCurrent",
		tags: ['Orval'],
	requestParams: {
		path: z.object({ tournId: z.coerce.number().int().positive() }),
			},
		responses: {
			200: {
				description: 'Successful response',
				content: {
					'application/json': {
						schema: z.array(CurrentBallotSchema),
					},
				},
			},
		},
	};
export default router;
