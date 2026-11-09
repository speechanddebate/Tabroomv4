import { Router } from 'express';
import { loadJudgeAuthContext } from '../../../../../middleware/auth/authContext.js';
import { ValidateRequest } from '../../../../../middleware/validation.js';
import { requireAccess, requirePerson } from '../../../../../middleware/auth/authorization.js';
import z from 'zod';
import judgesController from '../../../../../controllers/rest/judges/judgesController.js';
import { addConflict, getJudgeConflicts, removeConflict } from '../../../../../controllers/rest/judges/conflictsController.js';
import { JudgeConflictRequestSchema, JudgeConflictSchema, JudgeConflictsSchema, UnlinkedJudgeSchema } from '@tabroom/types';
import config from '../../../../../config.js';
import panelsRouter from './panels/panelsRouter.js';

const router = Router();

router.route('/unlinked/search')
	.get(requirePerson, ValidateRequest,judgesController.unlinkedSearch).openapi = {
		summary: 'Search for unlinked judges',
		path: '/rest/judges/unlinked/search',
		operationId: 'RestJudgesUnlinkedSearch',
		description: 'Search for judges that are not linked to a Tabroom account.',
		tags: ['Orval', 'Judges'],
		requestParams: {
			query: z.object({
				limit: z.coerce.number().default(100).meta({ description: 'Maximum number of results to return' }),
				offset: z.coerce.number().default(0).meta({ description: 'Number of results to skip for pagination' }),
				first: z.string().optional().meta({ description: 'First name to search for' }),
				last: z.string().optional().meta({ description: 'Last name to search for' }),
			}),
		},
		responses: {
			200: {
				description: 'A list of unlinked judges matching the search criteria',
				content: {
					'application/json': {
						schema: z.array(UnlinkedJudgeSchema),
					},
				},
			},
		},
	};

	router.param('judgeId', loadJudgeAuthContext);

if(!config.features.HIDE_DEV_ENDPOINTS) {
	router.use('/:judgeId/panels', panelsRouter);

	// ---- Conflict sheet: the judge (self) and the tourn's staff; it never closes, so no deadline check ----

	const judgeParams = z.object({
		judgeId: z.coerce.number().int().positive().meta({ description: 'ID of the judge' }),
	});

	const conflictErrors = {
		400: { $ref: '#/components/responses/BadRequest' },
		403: { $ref: '#/components/responses/Forbidden' },
		404: { $ref: '#/components/responses/NotFound' },
	};

	router.route('/:judgeId/conflicts').get(requireAccess('judge', 'conflicts'), ValidateRequest, getJudgeConflicts).openapi = {
		summary: "Get a judge's conflict sheet",
		description: 'The conflicts the judge may see at their tournament, and the entries, schools, or regions they may still mark',
		path: '/rest/judges/{judgeId}/conflicts',
		operationId: 'RestJudgesConflicts',
		tags: ['Orval', 'Judges'],
		requestParams: {
			path: judgeParams,
		},
		responses: {
			200: {
				description: 'The conflict sheet',
				content: {
					'application/json': {
						schema: JudgeConflictsSchema,
					},
				},
			},
			...conflictErrors,
		},
	};

	router.route('/:judgeId/conflicts')
	.post(requireAccess('judge', 'conflicts'), ValidateRequest, addConflict).openapi = {
		summary: 'Mark a conflict',
		description: 'Records that the judge cannot judge an entry, a school, or (mock trial) a region. A target the judge could not mark here is 404; a covered target or a closed category is 409 with a reason of closed, duplicate, school, or ownSchool',
		path: '/rest/judges/{judgeId}/conflicts',
		operationId: 'RestJudgesConflictAdd',
		tags: ['Orval', 'Judges'],
		requestParams: {
			path: judgeParams,
		},
		requestBody: {
			content: {
				'application/json': {
					schema: JudgeConflictRequestSchema,
				},
			},
		},
		responses: {
			201: {
				description: 'The conflict as it now appears on the sheet',
				content: {
					'application/json': {
						schema: JudgeConflictSchema,
					},
				},
			},
			409: { $ref: '#/components/responses/Conflict' },
			...conflictErrors,
		},
	};

	router.route('/:judgeId/conflicts/:strikeId')
	.delete(requireAccess('judge', 'conflicts'), ValidateRequest, removeConflict).openapi = {
		summary: 'Remove a conflict',
		description: 'Removes a conflict the caller entered, or one declared from the judge\'s side (a derived or judge-entered row). A coach\'s or tab\'s row is 403',
		path: '/rest/judges/{judgeId}/conflicts/{strikeId}',
		operationId: 'RestJudgesConflictRemove',
		tags: ['Orval', 'Judges'],
		requestParams: {
			path: judgeParams.extend({
				strikeId: z.coerce.number().int().positive().meta({ description: 'ID of the conflict (strike) row' }),
			}),
		},
		responses: {
			204: { description: 'Removed' },
			...conflictErrors,
		},
	};
}

export default router;