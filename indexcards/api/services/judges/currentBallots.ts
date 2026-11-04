import type { CurrentBallot } from '@tabroom/types';
import type ballotRepo from '../../repos/ballotRepo.js';
import { flightStart } from '../../helpers/flight.js';
import logger from '../../helpers/logger.js';
import { groupBy } from '../../helpers/objectify.js';
import { isOn } from '../ballots/ballotRules.js';
import { sideLabel } from './judgeHistory.js';

export type JudgePanelRow = Awaited<ReturnType<typeof ballotRepo.getJudgePanels>>[number];

type Settings = Record<string, string> | null | undefined;
type SettingsById = Map<number, Settings>;

/** The settings the current ballot card reads, by table */
export const CURRENT_BALLOT_SETTINGS = {
	tourn: ['legion'],
	event: ['online_mode', 'online_ballots', 'start_button', 'start_button_text', 'flight_offset', 'aff_label', 'neg_label'],
	round: ['judges_ballots_visible'],
	panel: ['flip_status', 'show_async'],
};

export function settingsById(rows: { id: number; settings?: Settings }[]): SettingsById {
	return new Map(rows.map((row) => [row.id, row.settings]));
}

export type CurrentBallotContext = {
	now: Date;
	tourns: Map<number, { tz: string | null; settings?: Settings }>;
	events: SettingsById;
	rounds: SettingsById;
	panels: SettingsById;
};

const FLIP_STATUSES: readonly string[] = ['done', 'winner', 'loser', 'anyone'];

/**
 * The judges' open panels as the current ballots card shows them, one per panel and judge,
 * from getJudgePanels rows and the settings of their tourns, events, rounds, and panels.
 * Room is left null for the caller to resolve for the person
 */
export function buildCurrentBallots(rows: JudgePanelRow[], ctx: CurrentBallotContext): CurrentBallot[] {
	const ballots: CurrentBallot[] = [];
	const judged = rows.filter((row): row is JudgePanelRow & { judge: number; tourn: number } => row.judge !== null && row.tourn !== null && row.entryActive === 1);

	for (const panelRows of groupBy(judged, (row) => `${row.panel}-${row.judge}`).values()) {
		const first = panelRows[0];
		const event = ctx.events.get(first.event);
		const round = ctx.rounds.get(first.round);
		const panel = ctx.panels.get(first.panel);
		const tourn = ctx.tourns.get(first.tourn);

		// Judges see a round once it's published, or released to judges only (classic's
		// "Publish ballots but not schematic"), the same rule as the ballot routes' judgePolicy
		if (first.roundPublished !== 1 && !isOn(round?.judges_ballots_visible)) continue;

		const audited = panelRows.some((row) => row.audit === 1);
		const chair = panelRows.some((row) => row.chair === 1);
		// an audited panel stays open for its chair, in mock trial and congress where the work
		// goes on after the ballot, and for anyone once the timeslot has ended
		if (audited && !chair && first.eventType !== 'mock_trial' && first.eventType !== 'congress' && first.timeslotEnd && ctx.now < first.timeslotEnd) continue;

		const onlineMode = event?.online_mode ?? null;
		if (onlineMode === 'async' && first.timeslotEnd && first.timeslotEnd < ctx.now) continue;

		const start = first.roundStart ?? first.timeslotStart;
		if (!start || !first.timeslotEnd) {
			logger.warn('Current ballot panel without a start or end', { panel: first.panel });
			continue;
		}

		const flightOffset = first.roundFlighted ? event?.flight_offset : 0;
		const flipStatus = FLIP_STATUSES.includes(panel?.flip_status ?? '') ? panel?.flip_status as CurrentBallot['flipStatus'] : null;

		ballots.push({
			id: first.panel,
			name: first.roundName,
			label: first.roundLabel,
			flight: first.roundFlighted ? Number(first.panelFlight) : null,
			flipStatus,
			status: panelRows.some((row) => row.scored) ? 'scored' : panelRows.some((row) => row.judge_started) ? 'started' : 'not_started',
			startText: event?.start_button ?? null,
			ballotText: event?.start_button_text ?? null,
			show_async: isOn(panel?.show_async),
			onlineBallots: isOn(event?.online_ballots),
			legion: isOn(tourn?.settings?.legion),
			start: flightStart(start, first.panelFlight, flightOffset).toISOString(),
			deadline: flightStart(first.timeslotEnd, first.panelFlight, flightOffset).toISOString(),
			roomId: first.room,
			Room: null,
			roomNotes: isOn(round?.judges_ballots_visible) ? first.roomNotes : null,
			chair,
			audited,
			tourn: first.tourn,
			TournTz: tourn?.tz ?? 'UTC',
			eventName: first.eventName ?? '',
			eventAbbr: first.eventAbbr,
			eventType: first.eventType,
			onlineMode,
			JudgeId: first.judge,
			RoundId: first.round,
			Entries: panelRows.map((row) => ({
				id: row.entry,
				code: row.entryCode,
				side: !flipStatus || flipStatus === 'done' ? sideLabel(first.eventType, row.side, row.speakerorder, event?.aff_label ?? null, event?.neg_label ?? null) : null,
				speakerOrder: row.speakerorder,
			})),
		});
	}
	return ballots;
}
