import { NotFound } from '../../../../helpers/problem.js';
import type { Response } from 'express';
import type { BallotContext } from '@tabroom/types';
import type { ValidatedRequest } from '../../../../middleware/validation.js';
import { db } from '../../../../data/database.js';
import { ballotRules } from '../../../../services/ballots/ballotRules.js';
import { loadBallotInputs } from '../../../../services/ballots/loadBallotInputs.js';

// Returns the BallotContext: everything needed to render this judge's ballot
// for this panel.
export async function getBallotContext(req: ValidatedRequest, res: Response) {
	const judgeId = Number(req.params.judgeId);
	const panelId = Number(req.params.panelId);

	const inputs = await loadBallotInputs(db, judgeId, panelId);
	if (!inputs) return NotFound(req, res, `Panel ${panelId} not found`);

	const rules = ballotRules(inputs);
	const { tourn, event, round, room, judge } = inputs;

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
			chairLabel: rules.chairLabel,
			topic: rules.topic,
			rules: rules.rules,
			// classic falls back to UTC
			tz: tourn.tz ?? 'UTC',
			Tourn: { id: tourn.id },
			Event: { abbr: event.abbr },
			Round: { id: round.id },
			roundName: rules.roundName,
			flight: rules.flight,
			roundNotes: rules.roundNotes,
			// Most rooms store an empty url, which classic treats as none
			Room: room ? { name: room.name, url: room.url || null } : null,
			Judge: { code: judge.code, first: judge.first, middle: judge.middle, last: judge.last },
			ballotHeader: rules.ballotHeader,
			roundStart: rules.roundStart.toISOString(),
			decisionDeadline: rules.decisionDeadline?.toISOString() ?? null,
			onlineMode: rules.onlineMode,
			scoring: {
				...rules.scoring,
				feedback: rules.scoring.feedback && {
					...rules.scoring.feedback,
					editableUntil: rules.scoring.feedback.editableUntil?.toISOString() ?? null,
				},
			},
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
