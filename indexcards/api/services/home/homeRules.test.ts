import { compareTourns, groupBy, homeWindow, isOnline, isRunning, paradigmReview, rolesFor, sqlDatetime } from './homeRules.js';

const now = new Date('2026-03-07T12:00:00Z');

describe('homeWindow', () => {
	it('reaches back 7 days for a full load', () => {
		expect(homeWindow(now, false)).toEqual({ endAfter: new Date('2026-02-28T12:00:00Z') });
	});
	it('brackets now for the running poll', () => {
		expect(homeWindow(now, true)).toEqual({ startBefore: now, endAfter: now });
	});
});

describe('rolesFor', () => {
	const scope = {
		judges: [{ tourn: 1 }],
		entries: [{ tourn: 1 }, { tourn: 2 }],
		schools: [{ tourn: 2, tag: 'chapter' }, { tourn: 3, tag: 'prefs' }],
		permissions: [{ tourn: 1 }],
	};
	it('lists the roles the person holds at the tourn in display order', () => {
		expect(rolesFor(scope, 1)).toEqual(['judge', 'competitor', 'tab']);
		expect(rolesFor(scope, 2)).toEqual(['competitor', 'coach']);
		expect(rolesFor(scope, 3)).toEqual(['coach']);
	});
	it('is empty at a tourn the person has no row at', () => {
		expect(rolesFor(scope, 4)).toEqual([]);
	});
});

describe('isRunning', () => {
	it('is true from the start to the end inclusive', () => {
		expect(isRunning({ start: new Date('2026-03-07T00:00:00Z'), end: new Date('2026-03-08T00:00:00Z') }, now)).toBe(true);
		expect(isRunning({ start: now, end: now }, now)).toBe(true);
		expect(isRunning({ start: new Date('2026-03-08T00:00:00Z'), end: new Date('2026-03-09T00:00:00Z') }, now)).toBe(false);
		expect(isRunning({ start: new Date('2026-03-01T00:00:00Z'), end: new Date('2026-03-02T00:00:00Z') }, now)).toBe(false);
	});
});

describe('isOnline', () => {
	it('is true when any event has an online mode other than none', () => {
		expect(isOnline([{ settings: null }, { settings: { online_mode: 'sync' } }])).toBe(true);
		expect(isOnline([{ settings: { online_mode: 'none' } }, { settings: {} }])).toBe(false);
		expect(isOnline([])).toBe(false);
	});
});

describe('compareTourns', () => {
	it('sorts by start then name', () => {
		const tourns = [
			{ start: new Date('2026-03-10T00:00:00Z'), name: 'Beta' },
			{ start: new Date('2026-03-01T00:00:00Z'), name: 'Zeta' },
			{ start: new Date('2026-03-10T00:00:00Z'), name: 'Alpha' },
		];
		expect(tourns.sort(compareTourns).map((tourn) => tourn.name)).toEqual(['Zeta', 'Alpha', 'Beta']);
	});
});

describe('sqlDatetime', () => {
	it('reads a serialized MySQL datetime as UTC, passes a Date through, and rejects the rest', () => {
		expect(sqlDatetime('2026-03-04 05:06:07')).toEqual(new Date('2026-03-04T05:06:07Z'));
		expect(sqlDatetime(now)).toBe(now);
		expect(sqlDatetime(null)).toBeNull();
		expect(sqlDatetime('nope')).toBeNull();
	});
});

describe('groupBy', () => {
	it('groups rows by a key, keeping their order', () => {
		const groups = groupBy([{ t: 1, n: 'a' }, { t: 2, n: 'b' }, { t: 1, n: 'c' }], (row) => row.t);
		expect([...groups.entries()]).toEqual([[1, [{ t: 1, n: 'a' }, { t: 1, n: 'c' }]], [2, [{ t: 2, n: 'b' }]]]);
	});
});

describe('paradigmReview', () => {
	const start = new Date('2026-03-01T00:00:00Z');
	it('alerts when the paradigm predates the review window', () => {
		expect(paradigmReview(start, { exists: true, lastReviewed: new Date('2026-02-01T00:00:00Z') })).toEqual({
			start: '2026-03-01T00:00:00.000Z',
			lastReviewed: '2026-02-01T00:00:00.000Z',
		});
		expect(paradigmReview(start, { exists: true, lastReviewed: null })).toEqual({ start: '2026-03-01T00:00:00.000Z', lastReviewed: null });
	});
	it('stays quiet without a window, without a paradigm, or once reviewed', () => {
		expect(paradigmReview(null, { exists: true, lastReviewed: null })).toBeNull();
		expect(paradigmReview(start, { exists: false, lastReviewed: null })).toBeNull();
		expect(paradigmReview(start, { exists: true, lastReviewed: new Date('2026-03-02T00:00:00Z') })).toBeNull();
	});
});
