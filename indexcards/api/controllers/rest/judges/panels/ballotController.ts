import { Conflict, NotFound, NotImplemented, ServiceUnavailable, UnprocessableEntity } from '../../../../helpers/problem.js';
import type { Response } from 'express';
import type { BallotContext, BallotFeedback, BallotProgress, BallotSubmission } from '@tabroom/types';
import type { ValidatedRequest } from '../../../../middleware/validation.js';
import { getPerson } from '../../../../middleware/auth/authorization.js';
import { db, type Database } from '../../../../data/database.js';
import { ballotRules, ballotStatus, flipStatus } from '../../../../services/ballots/ballotRules.js';
import { loadBallotInputs } from '../../../../services/ballots/loadBallotInputs.js';
import { saveBallot, saveBallotFeedback } from '../../../../services/ballots/saveBallot.js';
import { getSectionRoom } from '../../../../services/onlineRooms/onlineRoomService.js';
import config from '../../../../config.js';
import logger from '../../../../helpers/logger.js';
import sessionRepo from '../../../../repos/sessionRepo.js';
import ballotRepo from '../../../../repos/ballotRepo.js';
import judgeRepo from '../../../../repos/judgeRepo.js';
import panelRepo from '../../../../repos/panelRepo.js';
import scoreRepo from '../../../../repos/scoreRepo.js';

// Returns the BallotContext: everything needed to render this judge's ballot
// for this panel.
export async function getBallotContext(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);

	const inputs = await loadBallotInputs(db, judgeId, panelId);
	if (!inputs) return NotFound(req, res, `Panel ${panelId} not found`);

	const rules = ballotRules(inputs);
	const { tourn, event, round, judge } = inputs;

	// Ballots the beta can't render yet go to the classic ballot
	const context: BallotContext = rules.unsupported.length > 0
		? {
			eventType: 'other',
			judge: judgeId,
			panel: panelId,
			tourn: tourn.id,
			supported: false,
		}
		: {
			eventType: 'debate',
			status: rules.status,
			chair: rules.chair,
			chairLabel: rules.chairLabel,
			topic: rules.topic,
			rules: rules.rules,
			// classic falls back to UTC
			tz: tourn.tz ?? 'UTC',
			Tourn: { id: tourn.id, end: tourn.end?.toISOString() ?? null },
			Event: { abbr: event.abbr },
			Round: { id: round.id, name: round.name, label: rules.roundLabel, notes: rules.roundNotes },
			flight: rules.flight,
			Room: (await getSectionRoom(db, tourn.id, panelId, req.actor))?.display ?? null,
			Judge: { code: judge.code, first: judge.first, middle: judge.middle, last: judge.last },
			ballotHeader: rules.ballotHeader,
			roundStart: rules.roundStart.toISOString(),
			decisionDeadline: rules.decisionDeadline?.toISOString() ?? null,
			onlineMode: rules.onlineMode,
			scoring: rules.scoring,
			Entries: rules.Entries,
			otherJudges: rules.otherJudges,
			timers: rules.timers,
			pointScale: rules.pointScale,
			speechTimes: rules.speechTimes,
			ballotTopics: rules.ballotTopics,
			docShare: rules.docShare,
			logo: rules.logo,
			debate: rules.debate,
		};

	return res.status(200).json(context);
}

// Validates the judge's submission and saves its scores, or only validates with ?dryRun=true.
// Returns the saved ballot for the judge to review before confirming.
export async function submitBallot(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);
	const submission: BallotSubmission = req.body;

	const inputs = await loadBallotInputs(db, judgeId, panelId);
	if (!inputs) return NotFound(req, res, `Panel ${panelId} not found`);

	const saved = await saveBallot(db, inputs, submission, { person: person.id, dryRun: req.query.dryRun });

	switch (saved.result) {
		case 'unsupported':
			return Conflict(req, res, 'This ballot can only be entered on classic Tabroom', { reasons: saved.reasons });
		case 'confirmed':
			return Conflict(req, res, 'This ballot has already been confirmed. Contact the tab room to change it');
		case 'changed':
			return Conflict(req, res, 'This ballot changed while you were entering it. Reload and try again');
		case 'invalid':
			return UnprocessableEntity(req, res, 'The ballot has errors', saved.errors);
		case 'valid':
		case 'saved':
			return res.status(200).json(saved.review);
	}
}

// Makes a saved ballot final (ballot_confirm.mhtml).
// TEMPORARY: until ballot_confirm and round_done.mas (notifications, backups, autoqueue) are
// ported, this calls classic's ballot_confirm.mhtml with the caller's own session, so classic
// does all of it as if the judge had clicked confirm there. Classic answers with a page or a
// redirect, so whether it worked is read from the ballot rows afterwards, not the response.
export async function confirmBallotScores(req: ValidatedRequest, res: Response) {
	getPerson(req);
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);

	const before = await ballotProgress(db, judgeId, panelId);
	// Confirming twice, e.g. a double click, isn't an error
	if (before.status === 'confirmed') return res.status(200).json(before);
	if (before.status !== 'scored') return Conflict(req, res, 'Submit the ballot before confirming it');

	// Classic only takes a session cookie, which is all the API accepts today
	const session = req.auth.sessionId ? await sessionRepo.getSession(db, req.auth.sessionId) : undefined;
	if (!session?.userkey) return NotImplemented(req, res, 'Confirming a ballot needs a login session');

	const url = new URL('/user/judge/ballot_confirm.mhtml', config.classic.url);
	url.searchParams.set('panel_id', String(panelId));
	url.searchParams.set('judge_id', String(judgeId));

	try {
		await fetch(url, {
			headers: {
				cookie: `${config.cookie.name}=${session.userkey}`,
				...(config.classic.host ? { host: config.classic.host } : {}),
			},
			// Classic reports errors by redirecting; the ballot rows say whether it worked
			redirect: 'manual',
			signal: AbortSignal.timeout(config.classic.timeout),
		});
	} catch (err) {
		// A timeout may still have confirmed it, so check the rows either way
		logger.warn(`Calling classic ballot_confirm for judge ${judgeId} on panel ${panelId} failed: ${err}`);
	}

	const after = await ballotProgress(db, judgeId, panelId);
	if (after.status === 'confirmed') return res.status(200).json(after);

	logger.warn(`Classic ballot_confirm didn't confirm judge ${judgeId}'s ballot on panel ${panelId}`);
	return ServiceUnavailable(req, res, 'Your ballot was saved but couldn\'t be confirmed. Confirm it on classic Tabroom');
}

// Marks the ballot as opened by the judge. The page calls it when the ballot loads
export async function startBallot(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);

	const judge = await judgeRepo.getJudge(req.db, judgeId);
	if (!judge) return NotFound(req, res, `Judge ${judgeId} not found`);

	// Someone entering it for the judge, like tab staff or a site admin, doesn't count (classic's "notme")
	if (judge.person === person.id) {
		await ballotRepo.markBallotsStarted(req.db, { judge: judgeId, panel: panelId, person: person.id });
	}

	return res.status(200).json(await ballotProgress(req.db, judgeId, panelId));
}

// Polled while the ballot is open, so the page notices a ballot confirmed elsewhere.
// Reads only the judge's ballot rows and scores, not the full ballot inputs
export async function getBallotStatus(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);

	return res.status(200).json(await ballotProgress(db, judgeId, panelId));
}

// The judge's status, plus the sides and flip status, which replace classic getBallotSides:
// the page reloads the context when a coin flip moves the sides
async function ballotProgress(database: Database, judgeId: number, panelId: number): Promise<BallotProgress> {
	const [ballots, panel] = await Promise.all([
		ballotRepo.getBallots(database, { judge: judgeId, panel: panelId }),
		panelRepo.getPanel(database, panelId, { settings: ['flip_status'] }),
	]);
	const scores = await scoreRepo.getScores(database, { ballots: ballots.map(ballot => ballot.id) });

	return {
		status: ballotStatus({ ballots, scores }),
		Entries: ballots
			.filter(ballot => ballot.entry)
			.sort((a, b) => a.side - b.side)
			.map(ballot => ({ ballot: ballot.id, side: ballot.side })),
		flipStatus: panel ? flipStatus(panel) : null,
	};
}

// Saves the RFD and per-entry comments as drafts. Returns them as saved
export async function saveFeedback(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);
	const body: BallotFeedback = req.body;

	const saved = await saveBallotFeedback(db, { judge: judgeId, panel: panelId }, body);

	switch (saved.result) {
		case 'closed':
			return Conflict(req, res, 'The tournament is over, so feedback can no longer change');
		case 'invalid':
			return UnprocessableEntity(req, res, 'The feedback has errors', saved.errors);
		case 'saved':
			return res.status(200).json(saved.feedback);
	}
}
