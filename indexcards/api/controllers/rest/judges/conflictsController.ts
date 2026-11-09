import type { Response } from 'express';
import type { ConflictRefusal, JudgeConflictRequest } from '@tabroom/types';
import { Conflict, Forbidden, NotFound } from '../../../helpers/problem.js';
import type { ValidatedRequest } from '../../../middleware/validation.js';
import { getPerson } from '../../../middleware/auth/authorization.js';
import { db } from '../../../data/database.js';
import { addJudgeConflict, loadJudgeConflicts, removeJudgeConflict } from '../../../services/conflicts/judgeConflicts.js';

const REFUSALS: Record<ConflictRefusal, string> = {
	closed: 'This category does not take conflicts from judges',
	duplicate: 'That conflict is already marked',
	school: 'That entry is already covered by a conflict with its school',
	ownSchool: "A judge is never placed on their own school's entries, so it can't be marked",
};

export async function getJudgeConflicts(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const sheet = await loadJudgeConflicts(db, judgeId, getPerson(req).id);
	if (!sheet) return NotFound(req, res, `Judge ${judgeId} not found`);
	res.json(sheet);
}

export async function addConflict(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const request = req.body as JudgeConflictRequest;
	const outcome = await addJudgeConflict(db, judgeId, getPerson(req), request);
	if (!outcome) return NotFound(req, res, `Judge ${judgeId} not found`);
	if (outcome.result === 'notFound') return NotFound(req, res, `No ${request.type} ${request.id} the judge could mark at this tournament`);
	if (outcome.result === 'refused') return Conflict(req, res, REFUSALS[outcome.reason], { reason: outcome.reason });
	res.status(201).json(outcome.conflict);
}

export async function removeConflict(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const strikeId = Number(req.params.strikeId);
	const outcome = await removeJudgeConflict(db, judgeId, strikeId, getPerson(req));
	if (outcome === null) return NotFound(req, res, `Conflict ${strikeId} not found on judge ${judgeId}'s sheet`);
	if (outcome === 'forbidden') return Forbidden(req, res, 'Only the person who entered a conflict, or the judge for one declared on their behalf, may remove it');
	res.status(204).end();
}
