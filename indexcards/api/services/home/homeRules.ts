// Pure rules for the user home page: which tournaments are in the window, what roles a person
// holds at each, and the account alerts. The controller runs the queries and hands rows in here.

import type { HomeAlerts, HomeJudge, HomeRole } from '@tabroom/types';
import logger from '../../helpers/logger.js';
import { isOn } from '../ballots/ballotRules.js';

type Settings = Record<string, string> | null | undefined;

const DAY = 24 * 60 * 60 * 1000;

/** How long an ended tournament stays on the home page */
export const JUST_FINISHED_DAYS = 7;

/**
 * The tourn query options for the home window: tournaments running, upcoming, or ended in
 * the last 7 days, or with current, only the ones running now
 */
export function homeWindow(now: Date, current: boolean): { startBefore?: Date; endAfter: Date } {
	return current
		? { startBefore: now, endAfter: now }
		: { endAfter: new Date(now.getTime() - JUST_FINISHED_DAYS * DAY) };
}

/** Rows that place a person at a tourn, by table. schools are the ones that get a card */
export type ScopeRows = {
	judges: { tourn: number | null }[];
	entries: { tourn: number | null }[];
	schools: { tourn: number | null }[];
	permissions: { tourn: number | null }[];
};

/** The roles the person holds at a tourn, in display order */
export function rolesFor(scope: ScopeRows, tournId: number): HomeRole[] {
	const roles: HomeRole[] = [];
	if (scope.judges.some((judge) => judge.tourn === tournId)) roles.push('judge');
	if (scope.entries.some((entry) => entry.tourn === tournId)) roles.push('competitor');
	if (scope.schools.some((school) => school.tourn === tournId)) roles.push('coach');
	if (scope.permissions.some((permission) => permission.tourn === tournId)) roles.push('tab');
	return roles;
}

/** A category's pref sheet window, when it has one */
export function strikeWindow(settings: Record<string, unknown> | null | undefined): { start: Date; end: Date } | null {
	const start = sqlDatetime(settings?.strike_start as Date | string | null | undefined);
	const end = sqlDatetime(settings?.strike_end as Date | string | null | undefined);
	return start && end ? { start, end } : null;
}

export function isRunning(tourn: { start: Date; end: Date }, now: Date): boolean {
	return tourn.start <= now && now <= tourn.end;
}

/** Whether any of the tourn's events runs online: an online mode other than none */
export function isOnline(events: { settings?: Record<string, unknown> | null }[]): boolean {
	return events.some((event) => {
		const mode = event.settings?.online_mode;
		return typeof mode === 'string' && mode !== '' && mode !== 'none';
	});
}

export function compareTourns(a: { start: Date; name: string }, b: { start: Date; name: string }): number {
	return a.start.getTime() - b.start.getTime() || a.name.localeCompare(b.name);
}

/**
 * A MySQL datetime as selectSettings serializes it inside JSON, e.g. 2026-01-02 03:04:05,
 * read as UTC. Its type says Date, but through JSON it arrives as that string
 */
export function sqlDatetime(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	const date = new Date(`${value.replace(' ', 'T')}Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** The quiz ids a category or pool requires of its judges: required_quizzes (a json list) and paradigm_quiz */
export function requiredQuizIds(settings: Record<string, unknown> | null | undefined): number[] {
	const ids: number[] = [];
	let list = settings?.required_quizzes;
	if (typeof list === 'string') {
		try {
			list = JSON.parse(list);
		} catch {
			list = [];
		}
	}
	if (Array.isArray(list)) ids.push(...list.map(Number).filter((id) => id > 0));
	const paradigm = Number(settings?.paradigm_quiz);
	if (paradigm > 0) ids.push(paradigm);
	return [...new Set(ids)];
}

export type QuizRequirement = { quiz: number; requiredBy: string };

/**
 * A judge's questionnaires: each required quiz with the person's attempt. A required quiz
 * that no longer exists is logged and dropped
 */
export function judgeQuizzes(
	requirements: QuizRequirement[],
	quizzes: Map<number, { id: number; label: string | null; approval: number }>,
	attempts: Map<number, { completed: number; approved_by: number | null; pending: number }>,
): HomeJudge['Quizzes'] {
	const result: HomeJudge['Quizzes'] = [];
	for (const { quiz: id, requiredBy } of requirements) {
		if (result.some((item) => item.Quiz.id === id)) continue;
		const quiz = quizzes.get(id);
		if (!quiz) {
			logger.warn('Required quiz does not exist', { quiz: id, requiredBy });
			continue;
		}
		const attempt = attempts.get(id);
		result.push({
			Quiz: { id: quiz.id, label: quiz.label, approval: quiz.approval },
			requiredBy,
			PersonQuiz: attempt ? { completed: attempt.completed, approved_by: attempt.approved_by, pending: attempt.pending } : null,
		});
	}
	return result;
}

export type RoundLevels = {
	published: number | null;
	post_primary: number | null;
	post_secondary: number | null;
	post_feedback: number | null;
};

/** A round is listed for an entry once it is published at any level or has primary results posted */
export function roundListed(round: RoundLevels, tournEnded: boolean): boolean {
	return tournEnded || (round.published ?? 0) > 0 || (round.post_primary ?? 0) > 0;
}

export type RoundVisibility = {
	/** room, side, and opponents: the pairing is published (1) or published without judges (2) */
	pairing: boolean;
	judges: boolean;
	/** decision and rank scores */
	primary: boolean;
	/** point and refutation scores */
	secondary: boolean;
	feedback: boolean;
};

/**
 * What an entry may see of a round by its publish levels, classic's rules: judges and
 * results need the round fully published, and each result level needs its post_* level
 * past 1. Once the tourn has ended every round counts as fully published, but results
 * still need their post_* levels (classic's user/student/show_entry.mas)
 */
export function roundVisibility(round: RoundLevels, tournEnded: boolean): RoundVisibility {
	const published = tournEnded ? 1 : round.published ?? 0;
	return {
		pairing: published === 1 || published === 2,
		judges: published === 1,
		primary: published === 1 && (round.post_primary ?? 0) > 1,
		secondary: published === 1 && (round.post_secondary ?? 0) > 1,
		feedback: published === 1 && (round.post_feedback ?? 0) > 1,
	};
}

// Which tags each result level releases, by event type (classic's user/student/show_entry.mas)
const SCORE_LEVELS: Record<string, { primary: readonly string[]; secondary: readonly string[] }> = {
	speech: { primary: ['rank'], secondary: ['point'] },
	congress: { primary: ['rank'], secondary: ['point'] },
	wudc: { primary: ['rank', 'winloss', 'point'], secondary: [] },
	debate: { primary: ['winloss'], secondary: ['point', 'rank', 'refute'] },
};

/** Whether a score tag is shown at the round's result levels. Event types without their own levels use debate's */
export function scoreVisible(tag: string | null, visibility: RoundVisibility, eventType: string | null): boolean {
	if (tag === null) return false;
	const levels = SCORE_LEVELS[eventType ?? ''] ?? SCORE_LEVELS.debate;
	return (visibility.primary && levels.primary.includes(tag)) || (visibility.secondary && levels.secondary.includes(tag));
}

/**
 * Whether the judge still owes the training ballot, classic's rule (user/judge/panels.mhtml): the
 * category shows training, the judge isn't ballot_trained, and the tourn hasn't ended. At a tourn
 * split into weekends, only while the category's weekend is running
 */
export function trainingDue(
	judge: { settings?: Settings; tournWeekends: number | boolean; weekendStart: Date | null; weekendEnd: Date | null },
	category: Settings,
	tournEnd: Date,
	now: Date,
): boolean {
	if (!isOn(category?.show_training) || isOn(judge.settings?.ballot_trained) || tournEnd <= now) return false;
	return !judge.tournWeekends || (!!judge.weekendStart && !!judge.weekendEnd && judge.weekendStart < now && now < judge.weekendEnd);
}

/** Whether a panel's flip is open to its entries: released with flip_published, not a bye, and not done */
export function flipOpen(round: Settings, panel: { bye: number; flip_status: string | null | undefined }): boolean {
	return isOn(round?.flip_published) && panel.bye === 0 && !!panel.flip_status && panel.flip_status !== 'done';
}

/** Whether judges are shown by code only: the tourn's ncfl or the event's anonymous_public, unless no_anon_dashboard */
export function judgeAnonymous(tourn: Settings, event: Settings): boolean {
	return !isOn(event?.no_anon_dashboard) && (isOn(event?.anonymous_public) || isOn(tourn?.ncfl));
}

/**
 * The paradigm review alert: present while a review window is open and the person has a
 * paradigm last saved before it opened
 */
export function paradigmReview(reviewStart: Date | null, paradigm: { exists: boolean; lastReviewed: Date | null }): HomeAlerts['paradigmReview'] {
	if (!reviewStart || !paradigm.exists) return null;
	if (paradigm.lastReviewed && paradigm.lastReviewed >= reviewStart) return null;
	return {
		start: reviewStart.toISOString(),
		lastReviewed: paradigm.lastReviewed?.toISOString() ?? null,
	};
}
