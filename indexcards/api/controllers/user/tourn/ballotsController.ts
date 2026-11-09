import type { Response } from 'express';
import { getPerson } from '../../../middleware/auth/authorization.js';
import type { ValidatedRequest } from '../../../middleware/validation.js';
import { db } from '../../../data/database.js';
import ballotRepo from '../../../repos/ballotRepo.js';
import eventRepo from '../../../repos/eventRepo.js';
import judgeRepo from '../../../repos/judgeRepo.js';
import panelRepo from '../../../repos/panelRepo.js';
import roundRepo from '../../../repos/roundRepo.js';
import tournRepo from '../../../repos/tournRepo.js';
import { buildCurrentBallots, CURRENT_BALLOT_SETTINGS, settingsById } from '../../../services/judges/currentBallots.js';

const unique = (ids: number[]) => [...new Set(ids)];

export async function getCurrent(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const tournId: number = req.params.tournId;
	const now = new Date();

	const [tourn, judges] = await Promise.all([
		tournRepo.getTourn(db, tournId, { settings: CURRENT_BALLOT_SETTINGS.tourn }),
		judgeRepo.getPersonJudges(db, person.id, { tourns: [tournId] }),
	]);
	if (!tourn || !tourn.end || tourn.end < now) return res.json([]);

	const rows = await ballotRepo.getJudgePanels(db, { judges: judges.map((judge) => judge.id) });
	const [events, rounds, panels] = await Promise.all([
		eventRepo.getEvents(db, { ids: unique(rows.map((row) => row.event)), settings: CURRENT_BALLOT_SETTINGS.event }),
		roundRepo.getRounds(db, {}, { ids: unique(rows.map((row) => row.round)), settings: CURRENT_BALLOT_SETTINGS.round, unpublished: true }),
		panelRepo.getPanels(db, { ids: unique(rows.map((row) => row.panel)), settings: CURRENT_BALLOT_SETTINGS.panel }),
	]);

	return res.json(buildCurrentBallots(rows, {
		now,
		tourns: new Map([[tourn.id, tourn]]),
		events: settingsById(events),
		rounds: settingsById(rounds),
		panels: settingsById(panels),
	}));
}

export default {
	getCurrent,
};
