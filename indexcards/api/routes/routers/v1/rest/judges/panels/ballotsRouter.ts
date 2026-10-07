import { Router } from 'express';
import type { Request, Response } from 'express';
import { NotImplemented } from '../../../../../../helpers/problem.js';
import { ValidateRequest } from '../../../../../../middleware/validation.js';
import { requireAccess } from '../../../../../../middleware/auth/authorization.js';
import { getBallotContext } from '../../../../../../controllers/rest/judges/panels/ballotController.js';
import { BallotContextSchema } from '@tabroom/types';
import z from 'zod';

// /v1/rest/judges/:judgeId/panels/:panelId/ballots
//
// A judge's ballot rows on a panel are one 'ballot', identified by (judgeId, panelId).
// panelsRouter has already checked that the judge has a ballot on the panel.
// Each route checks ballot/read or ballot/write; whether a change is allowed right now
// (confirmed, side disagreement) is up to the service.
const router = Router({ mergeParams: true });

const notImplemented = (req: Request, res: Response) => NotImplemented(req, res);

const ballot = (req: Request) => ({
	judgeId: Number(req.params.judgeId),
	panelId: Number(req.params.panelId),
});


const ballotParams = z.object({
	judgeId: z.coerce.number().int().positive().meta({ description: 'ID of the judge' }),
	panelId: z.coerce.number().int().positive().meta({ description: 'ID of the panel (section)' }),
});

// returned by the loaders, policy and access check in front of every ballot route.
// 401 and 500 are added to every route by createOpenApiSpec
const ballotErrors = {
	400: { $ref: '#/components/responses/BadRequest' },
	403: { $ref: '#/components/responses/Forbidden' },
	404: { $ref: '#/components/responses/NotFound' },
};

// ---- Core (all types) ----

// returns the BallotContext. all the params needed to render the correct ballot UI
router.route('/').get(requireAccess('ballot', 'read', ballot), ValidateRequest, getBallotContext).openapi = {
	summary: 'Get ballot context',
	description: 'Everything needed to render this judge\'s ballot for this panel',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots',
	operationId: 'RestJudgesBallotContext',
	tags: ['Orval', 'Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: {
			description: 'Successful response',
			content: {
				'application/json': {
					schema: BallotContextSchema,
				},
			},
		},
		...ballotErrors,
	},
};

// Validates the submission and writes ballot/score rows
router.route('/').put(requireAccess('ballot', 'write', ballot), notImplemented).openapi = {
	summary: 'Save ballot',
	description: 'Validates the ballot and writes its scores',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots',
	operationId: 'RestJudgesBallotSave',
	tags: ['Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: { description: 'Ballot saved' },
		...ballotErrors,
	},
};

// Sets started_by/judge_started if empty. run when judge opens ballot
router.route('/start').post(requireAccess('ballot', 'write', ballot), notImplemented).openapi = {
	summary: 'Start ballot',
	description: 'Marks the ballot as started by the judge, if it isn\'t already',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/start',
	operationId: 'RestJudgesBallotStart',
	tags: ['Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: { description: 'Ballot started' },
		...ballotErrors,
	},
};

// Light poll every 1-2 minutes while on the ballot: access, sides changed by a flip, and whether
// the ballot was locked or confirmed elsewhere.
router.route('/status').get(requireAccess('ballot', 'read', ballot), notImplemented).openapi = {
	summary: 'Get ballot status',
	description: 'Polled while the ballot is open: access, sides changed by a flip, and whether it was locked or confirmed elsewhere',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/status',
	operationId: 'RestJudgesBallotStatus',
	tags: ['Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: { description: 'Ballot status' },
		...ballotErrors,
	},
};

// Replaces ballot_confirm.mhtml.
// Sets audit/audited_by, checks panel completion and runs roundDone
// (notifications, backups, autoqueue).
router.route('/confirm').post(requireAccess('ballot', 'write', ballot), notImplemented).openapi = {
	summary: 'Confirm ballot',
	description: 'Makes the decision final and runs the round completion steps',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/confirm',
	operationId: 'RestJudgesBallotConfirm',
	tags: ['Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: { description: 'Ballot confirmed' },
		...ballotErrors,
	},
};

// Replaces comment_save, rfd_only_save and legion_comments_save.
// Editable after confirm until
// the tournament ends. Resets comments_reviewed.
router.route('/comments').put(requireAccess('ballot', 'write', ballot), notImplemented).openapi = {
	summary: 'Save ballot comments',
	description: 'Saves the RFD and per-entry comments. Editable after confirm until the tournament ends',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/comments',
	operationId: 'RestJudgesBallotComments',
	tags: ['Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: { description: 'Comments saved' },
		...ballotErrors,
	},
};

export default router;
