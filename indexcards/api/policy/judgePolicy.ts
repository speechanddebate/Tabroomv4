import ballotRepo from '../repos/ballotRepo.js';
import panelRepo from '../repos/panelRepo.js';
import { getRound } from '../repos/roundRepo.js';
import { judgesSeeRound } from '../services/ballots/ballotRules.js';
import { NotFound } from '../helpers/problem.js';
import type { Database } from '../data/database.js';

import type { Request, Response, NextFunction } from 'express';

/**
 * 404 unless the :judgeId judge has a ballot on the :panelId panel that the caller may know about.
 * Callers who reach it only as the judge (the self role) don't see it until its round is out to
 * judges; tab staff, who can read the panel itself, always do.
 * expects both params to be validated already by their auth context loaders
 */
export async function requireJudgeOnPanel(req: Request, res: Response, next: NextFunction) {
	// anonymous callers get their 401 from the route rather than learning which ballots exist
	if (req.actor.type === 'anonymous') return next();

	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);
	// The same answer either way, so an unreleased ballot doesn't show it exists
	const notFound = () => NotFound(req, res, `Judge ${judgeId} has no ballot on panel ${panelId}`);

	try {
		const ballots = await ballotRepo.getBallots(req.db, { judge: judgeId, panel: panelId });
		if (ballots.length === 0) return notFound();

		if (!(await req.actor.can('panel', 'read', panelId)) && !(await roundOutToJudges(req.db, panelId))) {
			return notFound();
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
