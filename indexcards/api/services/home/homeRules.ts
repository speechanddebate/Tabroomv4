// Pure rules for the user home page: which tournaments are in the window, what roles a person
// holds at each, and the account alerts. The controller runs the queries and hands rows in here.

import type { HomeAlerts, HomeRole } from '@tabroom/types';

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

/** Rows that place a person at a tourn, by table */
export type ScopeRows = {
	judges: { tourn: number | null }[];
	entries: { tourn: number | null }[];
	schools: { tourn: number | null; tag: string | null }[];
	permissions: { tourn: number | null }[];
};

/** The roles the person holds at a tourn, in display order */
export function rolesFor(scope: ScopeRows, tournId: number): HomeRole[] {
	const roles: HomeRole[] = [];
	if (scope.judges.some((judge) => judge.tourn === tournId)) roles.push('judge');
	if (scope.entries.some((entry) => entry.tourn === tournId)) roles.push('competitor');
	// A prefs-only school only counts once it has an entry in a category with a strike
	// window; that check needs the school's entries and arrives with the coach section
	if (scope.schools.some((school) => school.tourn === tournId)) roles.push('coach');
	if (scope.permissions.some((permission) => permission.tourn === tournId)) roles.push('tab');
	return roles;
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

export function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const row of rows) {
		const k = key(row);
		const group = groups.get(k);
		if (group) group.push(row);
		else groups.set(k, [row]);
	}
	return groups;
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
