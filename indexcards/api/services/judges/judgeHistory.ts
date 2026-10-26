// Pure helpers for a judge's history at a tournament

// British Parliamentary positions by speaker order
const WUDC_POSITIONS: Record<number, string> = {
	1: '1G',
	2: '1O',
	3: '2G',
	4: '2O',
};

/**
 * The side or position label shown next to an entry on a judge's panel: the event's own
 * aff/neg labels for two-sided debate, the BP position for WUDC, nothing for speech.
 */
export function sideLabel(
	eventType: string | null,
	side: number | null,
	speakerorder: number | null,
	affLabel: string | null,
	negLabel: string | null,
): string | null {
	if (eventType === 'wudc') {
		return (speakerorder && WUDC_POSITIONS[speakerorder]) || null;
	}
	if (side === 1) return affLabel ?? 'Aff';
	if (side === 2) return negLabel ?? 'Neg';
	return null;
}

/** A score row as scoreRepo.getPanelScores returns it. student is 0 for an entry-level score. */
export type PanelScore = {
	tag: string | null;
	value: number;
	student: number;
	ballot: number;
	judge: number | null;
	entry: number | null;
	panel: number;
	side: number;
	forfeit: number;
	bye: number;
};

export type ScoreCell = {
	winloss: 'W' | 'L' | null;
	rank: number | null;
	point: number | null;
};

/** Folds score rows for one recipient into the decision, rank, and points shown for them */
export function scoreCell(scores: PanelScore[]): ScoreCell {
	const cell: ScoreCell = { winloss: null, rank: null, point: null };
	for (const score of scores) {
		if (score.tag === 'winloss') cell.winloss = score.value ? 'W' : 'L';
		else if (score.tag === 'rank') cell.rank = score.value;
		else if (score.tag === 'point') cell.point = score.value;
	}
	return cell;
}

/** This judge's entry-level scores. A WUDC panel scores together, so every judge's scores count. */
export function entryScores(scores: PanelScore[], entryId: number, judgeId: number, eventType: string | null): ScoreCell {
	return scoreCell(scores.filter(score =>
		score.entry === entryId
		&& score.student === 0
		&& (eventType === 'wudc' || score.judge === judgeId),
	));
}

/** This judge's scores for one speaker of an entry */
export function studentScores(scores: PanelScore[], entryId: number, studentId: number, judgeId: number): ScoreCell {
	return scoreCell(scores.filter(score =>
		score.entry === entryId
		&& score.student === studentId
		&& score.judge === judgeId,
	));
}

type WinnerEntry = { id: number; code: string | null; name: string | null };

const ELIM_TYPES = new Set(['elim', 'final', 'runoff']);

/**
 * The panel's winner and ballot count for a debate elimination round, shown when the judge
 * scored no speakers. The winner took more ballots (forfeits and byes aside) than they lost;
 * the record lists the larger count first, whichever side it was.
 */
export function panelWinner(
	scores: PanelScore[],
	entries: WinnerEntry[],
	roundType: string | null,
	eventType: string | null,
	hasStudentScores: boolean,
): { entry: number; code: string | null; name: string | null; record: string } | null {
	if (eventType === 'speech' || !ELIM_TYPES.has(roundType ?? '') || hasStudentScores) {
		return null;
	}

	const wins = new Map<number, Set<number>>();
	const losses = new Map<number, Set<number>>();
	let affWins = 0;
	let negWins = 0;

	for (const score of scores) {
		if (score.tag !== 'winloss' || score.student !== 0 || score.entry === null) continue;
		if (score.forfeit || score.bye) continue;
		if (score.value === 1) {
			if (score.side === 1) affWins++;
			else if (score.side === 2) negWins++;
		}
		const tally = score.value === 1 ? wins : losses;
		if (!tally.has(score.entry)) tally.set(score.entry, new Set());
		tally.get(score.entry)?.add(score.ballot);
	}

	const winner = entries.find(entry => (wins.get(entry.id)?.size ?? 0) > (losses.get(entry.id)?.size ?? 0));
	if (!winner) return null;

	return {
		entry: winner.id,
		code: winner.code,
		name: winner.name,
		record: `${Math.max(affWins, negWins)}-${Math.min(affWins, negWins)}`,
	};
}
