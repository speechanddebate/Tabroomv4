import { Router } from 'express';
import type { Request } from 'express';
import { ValidateRequest } from '../../../../../../middleware/validation.js';
import { requireAccess } from '../../../../../../middleware/auth/authorization.js';
import { confirmBallotScores, getBallotContext, getBallotStatus, saveFeedback, startBallot, submitBallot } from '../../../../../../controllers/rest/judges/panels/ballotController.js';
import { BallotContextSchema, BallotFeedbackSchema, BallotProgressSchema, BallotReviewSchema, BallotSubmissionSchema, BallotValidationProblemSchema, ProblemSchema } from '@tabroom/types';
import z from 'zod';

// /v1/rest/judges/:judgeId/panels/:panelId/ballots
//
// A judge's ballot rows on a panel are one 'ballot', identified by (judgeId, panelId).
// panelsRouter has already hidden rounds that aren't out to judges. Each route checks
// ballot/read or ballot/write, which needs a real ballot; whether a change is allowed right now
// (confirmed, side disagreement) is up to the service.
const router = Router({ mergeParams: true });

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
router.route('/').put(requireAccess('ballot', 'write', ballot), ValidateRequest, submitBallot).openapi = {
	summary: 'Save ballot',
	description: 'Validates the ballot and writes its scores, which the judge then reviews and confirms. With dryRun, only validates',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots',
	operationId: 'RestJudgesBallotSave',
	tags: ['Orval', 'Judges'],
	requestParams: {
		path: ballotParams,
		query: z.object({
			dryRun: z.stringbool().default(false).meta({ description: 'Validate without saving' }),
		}),
	},
	requestBody: {
		content: {
			'application/json': {
				schema: BallotSubmissionSchema,
			},
		},
	},
	responses: {
		200: {
			description: 'The ballot as saved, for the judge to review',
			content: {
				'application/json': {
					schema: BallotReviewSchema,
				},
			},
		},
		409: { $ref: '#/components/responses/Conflict' },
		422: {
			description: 'The ballot breaks its rules. errors lists every problem',
			content: {
				'application/problem+json': {
					schema: BallotValidationProblemSchema,
				},
			},
		},
		...ballotErrors,
	},
};

// Sets started_by/judge_started if empty. run when judge opens ballot
router.route('/start').post(requireAccess('ballot', 'write', ballot), ValidateRequest, startBallot).openapi = {
	summary: 'Start ballot',
	description: 'Marks the ballot as started by the judge, if it isn\'t already. Does nothing for someone entering it for the judge',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/start',
	operationId: 'RestJudgesBallotStart',
	tags: ['Orval', 'Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: {
			description: 'The ballot\'s status after starting it',
			content: {
				'application/json': {
					schema: BallotProgressSchema,
				},
			},
		},
		...ballotErrors,
	},
};

// Light poll every 1-2 minutes while on the ballot, to notice it was confirmed elsewhere or
// a coin flip moved the sides (classic getBallotSides). Losing access shows up as a 403 or
// 404 from the guards
router.route('/status').get(requireAccess('ballot', 'read', ballot), ValidateRequest, getBallotStatus).openapi = {
	summary: 'Get ballot status',
	description: 'Polled while the ballot is open, to notice it was confirmed elsewhere or a coin flip moved the sides. Lost access returns 403 or 404',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/status',
	operationId: 'RestJudgesBallotStatus',
	tags: ['Orval', 'Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: {
			description: 'Where the judge is with the ballot',
			content: {
				'application/json': {
					schema: BallotProgressSchema,
				},
			},
		},
		...ballotErrors,
	},
};

// Replaces ballot_confirm.mhtml. For now confirmBallotScores calls classic's ballot_confirm.mhtml
// with the caller's session, which audits the ballots and runs round_done.mas (notifications,
// backups, autoqueue), until those are ported.
router.route('/confirm').post(requireAccess('ballot', 'write', ballot), ValidateRequest, confirmBallotScores).openapi = {
	summary: 'Confirm ballot',
	description: 'Makes a saved ballot final and runs the round completion steps. Confirming a confirmed ballot does nothing',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/confirm',
	operationId: 'RestJudgesBallotConfirm',
	tags: ['Orval', 'Judges'],
	requestParams: {
		path: ballotParams,
	},
	responses: {
		200: {
			description: 'The ballot is confirmed',
			content: {
				'application/json': {
					schema: BallotProgressSchema,
				},
			},
		},
		409: { $ref: '#/components/responses/Conflict' },
		503: {
			description: 'The ballot is saved but couldn\'t be confirmed; the judge can confirm it on classic',
			content: {
				'application/problem+json': {
					schema: ProblemSchema,
				},
			},
		},
		...ballotErrors,
	},
};

// Replaces comment_save, rfd_only_save and legion_comments_save.
// Autosaved drafts, so the judge doesn't lose work; PUT / saves the final feedback.
// Editable after confirm until the tournament ends. Resets comments_reviewed.
router.route('/feedback').put(requireAccess('ballot', 'write', ballot), ValidateRequest, saveFeedback).openapi = {
	summary: 'Save ballot feedback',
	description: 'Saves the RFD and per-entry comments as drafts. A field left out stays as it is, and null or empty text deletes it. Editable after confirm until the tournament ends',
	path: '/rest/judges/{judgeId}/panels/{panelId}/ballots/feedback',
	operationId: 'RestJudgesBallotFeedback',
	tags: ['Orval', 'Judges'],
	requestParams: {
		path: ballotParams,
	},
	requestBody: {
		content: {
			'application/json': {
				schema: BallotFeedbackSchema,
			},
		},
	},
	responses: {
		200: {
			description: 'The RFD and every entry\'s comments as saved',
			content: {
				'application/json': {
					schema: BallotFeedbackSchema,
				},
			},
		},
		409: { $ref: '#/components/responses/Conflict' },
		422: {
			description: 'The comments are for entries that aren\'t on the ballot',
			content: {
				'application/problem+json': {
					schema: BallotValidationProblemSchema,
				},
			},
		},
		...ballotErrors,
	},
};

export default router;
