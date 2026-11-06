import logger from '../../helpers/logger.js';
import { compareTourns, homeWindow, isOnline, isRunning, judgeAnonymous, judgeQuizzes, paradigmReview, requiredQuizIds, rolesFor, roundListed, roundVisibility, scoreVisible, sqlDatetime, strikeWindow, trainingDue } from './homeRules.js';

const now = new Date('2026-03-07T12:00:00Z');

describe('homeWindow', () => {
	it('reaches back 7 days for a full load', () => {
		expect(homeWindow(now, false)).toEqual({ endAfter: new Date('2026-02-28T12:00:00Z') });
	});
	it('brackets now for the running poll', () => {
		expect(homeWindow(now, true)).toEqual({ startBefore: now, endAfter: now });
	});
});

describe('strikeWindow', () => {
	it('needs both ends of the window', () => {
		expect(strikeWindow({ strike_start: '2026-03-01 08:00:00', strike_end: '2026-03-02 08:00:00' })).toEqual({ start: new Date('2026-03-01T08:00:00Z'), end: new Date('2026-03-02T08:00:00Z') });
		expect(strikeWindow({ strike_start: '2026-03-01 08:00:00' })).toBeNull();
		expect(strikeWindow(null)).toBeNull();
	});
});

describe('rolesFor', () => {
	const scope = {
		judges: [{ tourn: 1 }],
		entries: [{ tourn: 1 }, { tourn: 2 }],
		schools: [{ tourn: 2 }, { tourn: 3 }],
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

describe('requiredQuizIds', () => {
	it('reads the json list and the paradigm quiz, without duplicates or junk', () => {
		expect(requiredQuizIds({ required_quizzes: '[3, 4, 3]', paradigm_quiz: '4' })).toEqual([3, 4]);
		expect(requiredQuizIds({ required_quizzes: [5], paradigm_quiz: '0' })).toEqual([5]);
		expect(requiredQuizIds({ required_quizzes: 'not json' })).toEqual([]);
		expect(requiredQuizIds(null)).toEqual([]);
	});
});

describe('judgeQuizzes', () => {
	it("pairs each required quiz with the person's attempt, once, and drops quizzes that no longer exist", () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
		const quizzes = new Map([[1, { id: 1, label: 'Ethics', approval: 0 }], [2, { id: 2, label: 'Paradigm', approval: 1 }]]);
		const attempts = new Map([[1, { completed: 1, approved_by: null, pending: 0 }]]);

		const result = judgeQuizzes([{ quiz: 1, requiredBy: 'LD' }, { quiz: 2, requiredBy: 'Pool A' }, { quiz: 1, requiredBy: 'Pool A' }, { quiz: 9, requiredBy: 'LD' }], quizzes, attempts);

		expect(result).toEqual([
			{ Quiz: { id: 1, label: 'Ethics', approval: 0 }, requiredBy: 'LD', PersonQuiz: { completed: 1, approved_by: null, pending: 0 } },
			{ Quiz: { id: 2, label: 'Paradigm', approval: 1 }, requiredBy: 'Pool A', PersonQuiz: null },
		]);
		expect(warn).toHaveBeenCalledWith('Required quiz does not exist', { quiz: 9, requiredBy: 'LD' });
		warn.mockRestore();
	});
});

describe('roundListed and roundVisibility', () => {
	const levels = (published: number, post_primary = 0, post_secondary = 0, post_feedback = 0) => ({ published, post_primary, post_secondary, post_feedback });

	it('lists a round once published at any level or with primary results posted', () => {
		expect(roundListed(levels(0), false)).toBe(false);
		expect(roundListed(levels(2), false)).toBe(true);
		expect(roundListed(levels(0, 1), false)).toBe(true);
		expect(roundListed(levels(0), true)).toBe(true);
	});

	it('opens the pairing at published 1 or 2, judges and results at 1 with their post levels past 1', () => {
		expect(roundVisibility(levels(2), false)).toEqual({ pairing: true, judges: false, primary: false, secondary: false, feedback: false });
		expect(roundVisibility(levels(3), false)).toEqual({ pairing: false, judges: false, primary: false, secondary: false, feedback: false });
		expect(roundVisibility(levels(1, 1, 1, 1), false)).toEqual({ pairing: true, judges: true, primary: false, secondary: false, feedback: false });
		expect(roundVisibility(levels(1, 2, 3, 2), false)).toEqual({ pairing: true, judges: true, primary: true, secondary: true, feedback: true });
		expect(roundVisibility(levels(0, 2), false)).toEqual({ pairing: false, judges: false, primary: false, secondary: false, feedback: false });
	});

	it('opens the pairing and judges once the tourn has ended, but results only at their post levels', () => {
		expect(roundVisibility(levels(0), true)).toEqual({ pairing: true, judges: true, primary: false, secondary: false, feedback: false });
		expect(roundVisibility(levels(3, 1, 1, 1), true)).toEqual({ pairing: true, judges: true, primary: false, secondary: false, feedback: false });
		expect(roundVisibility(levels(0, 2, 0, 2), true)).toEqual({ pairing: true, judges: true, primary: true, secondary: false, feedback: true });
	});

	it('releases each event type\'s tags at the primary and secondary levels like classic', () => {
		const primaryOnly = roundVisibility(levels(1, 2), false);
		const both = roundVisibility(levels(1, 2, 2), false);
		const tags = ['winloss', 'rank', 'point', 'refute', null];
		const at = (visibility: ReturnType<typeof roundVisibility>, type: string | null) => tags.filter((tag) => scoreVisible(tag, visibility, type));

		expect(at(primaryOnly, 'debate')).toEqual(['winloss']);
		expect(at(both, 'debate')).toEqual(['winloss', 'rank', 'point', 'refute']);
		expect(at(primaryOnly, 'speech')).toEqual(['rank']);
		expect(at(both, 'speech')).toEqual(['rank', 'point']);
		expect(at(primaryOnly, 'congress')).toEqual(['rank']);
		expect(at(primaryOnly, 'wudc')).toEqual(['winloss', 'rank', 'point']);
		expect(at(primaryOnly, null)).toEqual(['winloss']);
		expect(at(roundVisibility(levels(1, 1, 2), false), 'debate')).toEqual(['rank', 'point', 'refute']);
	});
});

describe('judgeAnonymous', () => {
	it('hides names for anonymous_public events and ncfl tourns unless the event opts out', () => {
		expect(judgeAnonymous({}, { anonymous_public: '1' })).toBe(true);
		expect(judgeAnonymous({ ncfl: '1' }, {})).toBe(true);
		expect(judgeAnonymous({ ncfl: '1' }, { no_anon_dashboard: '1' })).toBe(false);
		expect(judgeAnonymous({}, {})).toBe(false);
		expect(judgeAnonymous(null, null)).toBe(false);
	});
});

describe('trainingDue', () => {
	const now = new Date('2026-03-07T12:00:00Z');
	const later = new Date('2026-03-08T12:00:00Z');
	const earlier = new Date('2026-03-06T12:00:00Z');
	const untrained = { settings: {}, tournWeekends: 0, weekendStart: null, weekendEnd: null };
	const training = { show_training: '1' };

	it('is owed while the category shows training, the judge is untrained, and the tourn has not ended', () => {
		expect(trainingDue(untrained, training, later, now)).toBe(true);
		expect(trainingDue(untrained, {}, later, now)).toBe(false);
		expect(trainingDue({ ...untrained, settings: { ballot_trained: '1' } }, training, later, now)).toBe(false);
		expect(trainingDue(untrained, training, earlier, now)).toBe(false);
	});

	it("at a tourn split into weekends, is owed only during the category's weekend", () => {
		const weekends = { ...untrained, tournWeekends: 1 };
		expect(trainingDue({ ...weekends, weekendStart: earlier, weekendEnd: later }, training, later, now)).toBe(true);
		expect(trainingDue({ ...weekends, weekendStart: later, weekendEnd: later }, training, later, now)).toBe(false);
		expect(trainingDue(weekends, training, later, now)).toBe(false);
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
