// Every online coin flip rule: whether a flip is open, whose turn it is, what is left to
// choose, and how the flip moves on. Classic's rules are kept exactly (api/flip_monitor.mhtml,
// user/enter/flip.mhtml), minus its bugs. No DB access.

import type { Settings } from '../../repos/utils/index.js';
import { isOn } from '../ballots/ballotRules.js';

export const FLIP_STATUSES = ['winner', 'loser', 'anyone', 'done'] as const;
export type FlipStatus = typeof FLIP_STATUSES[number];

/**
 * The panel's flip setting, in the shape classic writes and reads
 * Locks are counts (perl increments them), so any positive value is locked. Numeric keys
 * count each entry's choices; nothing reads them.
 */
export type FlipState = {
	side_locked?: number;
	side_chosen?: string | null;
	side_chosen_by?: number;
	side_chosen_at?: string;
	side_auto_chosen?: number;
	order_locked?: number;
	order_chosen?: string | null;
	order_chosen_by?: number;
	order_chosen_at?: string;
	order_auto_chosen?: number;
	[key: string]: unknown;
};

const isLocked = (value: unknown) => Number(value) > 0;

/**
 * The panel's flip setting as an object. MariaDB returns a JSON setting nested in a settings
 * object as a string, and classic writes it unchecked, so a bad one reads as nothing chosen. */
export function parseFlip(value: unknown): FlipState | null {
	try {
		const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as FlipState : null;
	} catch {
		return null;
	}
}

/**
 * Returns the panel's flip_status, null if not set or for an invalid value it doesn't write. */
export function flipStatus(panel: { settings?: Settings | null }): FlipStatus | null {
	const status = panel.settings?.flip_status;
	return FLIP_STATUSES.find(value => value === status) ?? null;
}

/** Whether a flip has started and isn't done */
export function isFlipPending(status: string | null | undefined): boolean {
	return !!status && status !== 'done';
}

/** Whether the event's entries pick their sides in an online coin flip rather than the judge */
export function isFlipOnline(event: Settings | null | undefined): boolean {
	return isOn(event?.flip_online);
}

/**
 * Whether a panel's flip is open to an entry on it: released with flip_published, not a bye,
 * flip pending, the tourn not over and the entry's ballot not audited. */
export function isFlipOpen({ round, bye, status, ended, audited }: {
	round: Settings | null | undefined;
	bye: number;
	status: string | null | undefined;
	ended: boolean;
	audited: boolean;
}): boolean {
	return isOn(round?.flip_published) && bye === 0 && isFlipPending(status) && !ended && !audited;
}

/**
 * Whose turn it is from one entry's side of the panel: the toss winner's in winner, the other
 * entry's in loser, either in anyone. The caller should check the entry is on the panel. */
export function flipTurn(status: string | null | undefined, winner: number | null, entry: number): 'mine' | 'theirs' | 'either' | null {
	if (status === 'anyone') return 'either';
	if (status === 'winner') return entry === winner ? 'mine' : 'theirs';
	if (status === 'loser') return entry === winner ? 'theirs' : 'mine';
	return null;
}

/** What is still open: side unless locked, and speaking order only with flip_team_order */
export function flipChoices(event: Settings | null | undefined, flip: FlipState | null | undefined): { side: boolean; order: boolean } {
	return {
		side: !isLocked(flip?.side_locked),
		order: isOn(event?.flip_team_order) && !isLocked(flip?.order_locked),
	};
}

export type FlipStep = {
	status: FlipStatus;
	flipAt: Date;
	flip: FlipState;
	/** what an anyone window picked at random for the caller to write to the ballots; null when nothing was picked */
	autopick: {
		/** caller should swap the entries' sides*/
		swapSides: boolean;
		/** the side that speaks second, after any swap; null when order wasn't picked */
		secondSpeaker: 1 | 2 | null;
	} | null;
};

/**
 * Moves a pending flip on, as api/flip_monitor.mhtml does once a turn ends. A choice trigger is
 * classic's decision: the chooser's lock is already in flip. Every step is a transition the
 * entries are told about. The input flip isn't changed.
 */
export function nextFlip(
	status: Exclude<FlipStatus, 'done'>,
	flip: FlipState | null | undefined,
	trigger: 'choice' | 'timeout',
	event: Settings | null | undefined,
	now: Date,
	random: () => number = Math.random,
): FlipStep {
	const teamOrder = isOn(event?.flip_team_order);
	const anyoneChooses = isOn(event?.flip_anyone_chooses);
	const next: FlipState = { ...flip };
	// without team order only the side is chosen, so classic counts order as locked from the start
	if (!teamOrder && !isLocked(next.order_locked)) next.order_locked = 1;
	const bothLocked = isLocked(next.side_locked) && isLocked(next.order_locked);
	const step = {
		flipAt: new Date(now.getTime() + (Number(event?.flip_deadline) || 5) * 60_000),
		flip: next,
		autopick: null,
	};

	if (status === 'winner') {
		if (bothLocked) return { ...step, status: 'done' };
		if (teamOrder && (trigger === 'choice' || isLocked(next.side_locked) || isLocked(next.order_locked))) return { ...step, status: 'loser' };
		return { ...step, status: anyoneChooses ? 'anyone' : 'loser' };
	}

	if (status === 'loser') {
		if (bothLocked) return { ...step, status: 'done' };
		return { ...step, status: trigger === 'choice' ? 'winner' : 'anyone' };
	}

	if (bothLocked) return { ...step, status: 'done' };

	const chosenAt = now.toISOString().slice(0, 19).replace('T', ' ');
	const autopick: NonNullable<FlipStep['autopick']> = { swapSides: false, secondSpeaker: null };

	if (!isLocked(next.side_locked)) {
		Object.assign(next, { side_locked: 1, side_auto_chosen: 1, side_chosen_at: chosenAt });
		autopick.swapSides = random() < 0.5;
	}
	if (!isLocked(next.order_locked)) {
		Object.assign(next, { order_locked: 1, order_auto_chosen: 1, order_chosen_at: chosenAt });
		autopick.secondSpeaker = random() < 0.5 ? 1 : 2;
	}

	return { ...step, status: 'done', autopick };
}
