import type { CurrentBallot } from '@tabroom/types';
import type ballotRepo from '../../repos/ballotRepo.js';
import logger from '../../helpers/logger.js';
import { ballotStatus, decisionDeadline, flightNumber, isChair, isOn, judgesSeeRound, roundStart, sideLabel, sideNames, sideVisible } from '../ballots/ballotRules.js';
import { flipStatus } from '../flips/flipRules.js';

export type JudgePanelRow = Awaited<ReturnType<typeof ballotRepo.getJudgePanels>>[number];

type Settings = Record<string, string> | null | undefined;
type SettingsById = Map<number, Settings>;

/** The settings the current ballot card reads, by table */
export const CURRENT_BALLOT_SETTINGS = {
	tourn: ['legion'],
	event: ['online_mode', 'online_ballots', 'start_button', 'start_button_text', 'flight_offset', 'aff_label', 'neg_label', 'sidelock_elims', 'no_side_constraints', 'prelim_decision_deadline', 'elim_decision_deadline'],
	round: ['judges_ballots_visible', 'include_room_notes'],
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

/**
 * The judges' open panels as the current ballots card shows them, one per panel and judge,
 * from getJudgePanels rows and the settings of their tourns, events, rounds, and panels.
 * Room is left null for the caller to resolve for the person
 */
export function buildCurrentBallots(rows: JudgePanelRow[], ctx: CurrentBallotContext): CurrentBallot[] {
	const ballots: CurrentBallot[] = [];
	const judged = rows.filter((row): row is JudgePanelRow & { judge: number; tourn: number } => row.judge !== null && row.tourn !== null && row.entryActive === 1);

	for (const panelRows of Map.groupBy(judged, (row) => `${row.panel}-${row.judge}`).values()) {
		const first = panelRows[0];
		const event = ctx.events.get(first.event);
		const round = ctx.rounds.get(first.round);
		const panel = ctx.panels.get(first.panel);
		const tourn = ctx.tourns.get(first.tourn);

		if (!judgesSeeRound({ published: first.roundPublished, settings: round })) continue;

		if (!(first.roundStart ?? first.timeslotStart) || !first.timeslotEnd) {
			logger.warn('Current ballot panel without a start or end', { panel: first.panel });
			continue;
		}

		const timing = { round: { type: first.roundType, start_time: first.roundStart }, timeslot: { start: first.timeslotStart }, panel: { flight: first.panelFlight }, event: { settings: event } };
		// roundFlighted is the number of flights. A flight ends when the next one starts; the
		// last flight, or every flight of a round without a flight offset, ends with the timeslot
		const flight = Number(first.panelFlight) || 1;
		const end = flight < (first.roundFlighted ?? 0) && Number(event?.flight_offset) > 0
			? new Date(Math.min(first.timeslotEnd.getTime(), roundStart({ ...timing, panel: { flight: String(flight + 1) } }).getTime()))
			: first.timeslotEnd;

		const status = ballotStatus({ ballots: panelRows, scores: panelRows.map((row) => ({ tag: row.scoreTag })) });
		const chair = isChair({ ballots: panelRows });
		// Classic keeps an audited panel open only for a congress or mock trial chair, whose work
		// goes on after the ballot, until the round ends. Once it ends every audited panel stays
		// so the judge can edit feedback
		if (status === 'confirmed' && !(chair && (first.eventType === 'congress' || first.eventType === 'mock_trial')) && ctx.now < end) continue;

		const onlineMode = event?.online_mode ?? null;
		if (onlineMode === 'async' && end < ctx.now) continue;

		const sided = sideVisible({ type: first.roundType }, panel?.flip_status, event);

		ballots.push({
			id: first.panel,
			name: first.roundName,
			label: first.roundLabel,
			flight: flightNumber({ round: { flighted: first.roundFlighted }, panel: { flight: first.panelFlight } }),
			flipStatus: flipStatus({ settings: panel }),
			status,
			startText: event?.start_button ?? null,
			ballotText: event?.start_button_text ?? null,
			show_async: isOn(panel?.show_async),
			onlineBallots: isOn(event?.online_ballots),
			legion: isOn(tourn?.settings?.legion),
			start: roundStart(timing).toISOString(),
			// with no decision deadline, the flight's end
			deadline: (decisionDeadline(timing) ?? end).toISOString(),
			end: end.toISOString(),
			roomId: first.room,
			Room: null,
			roomNotes: isOn(round?.include_room_notes) ? first.roomNotes : null,
			chair,
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
				side: sided ? sideLabel(first.eventType, row.side, row.speakerorder, sideNames(event)) : null,
				speakerOrder: sided ? row.speakerorder : null,
			})),
		});
	}
	return ballots;
}
