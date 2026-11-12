import panelRepo from '../repos/panelRepo.js';
import { getRound } from '../repos/roundRepo.js';
import { judgesSeeRound } from '../services/ballots/ballotRules.js';
import { BadRequest, NotFound } from '../helpers/problem.js';
import { isPositiveId } from '../middleware/validation.js';
import type { Database } from '../data/database.js';

import type { Request, Response, NextFunction } from 'express';

/**
 * Tab staff (who can read the panel) pass. Anyone else gets a 404 until the panel's round is out to judges,
 * and a 404 for a ballot they can't read, so a stranger probing ids can't tell released rounds from unreleased
 * ones, and an unreleased ballot doesn't show it exists.
 * It runs before the route's ValidateRequest, so it checks both ids itself
 */
export async function requireRoundOutToJudges(req: Request, res: Response, next: NextFunction) {
	// anonymous callers get their 401 from the route rather than learning which rounds are out
	if (req.actor.type === 'anonymous') return next();

	const malformed = ['judgeId', 'panelId'].find(param => !isPositiveId(req.params[param]));
	if (malformed) return BadRequest(req, res, `${malformed} must be a positive integer`);

	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);

	try {
		if (await req.actor.can('panel', 'read', panelId)) return next();

		if (!(await roundOutToJudges(req.db, panelId)) || !(await req.actor.can('ballot', 'read', { judgeId, panelId }))) {
			return NotFound(req, res, `Judge ${judgeId} has no ballot on panel ${panelId}`);
		}
		next();
	} catch (err) {
		next(err);
	}
}

/** Whether judges can see the panel's round */
async function roundOutToJudges(db: Database, panelId: number): Promise<boolean> {
	const panel = await panelRepo.getPanel(db, panelId);
	const round = panel?.round
		? await getRound(db, panel.round, { settings: ['judges_ballots_visible'], unpublished: true })
		: undefined;
	return !!round && judgesSeeRound(round);
}
