import type { BallotEntry, BallotStudent, DebateBallotSubmission } from '@tabroom/types';
import { countWords, validateBallot, type ValidateBallotRules } from './validateBallot.js';

const student = (id: number): BallotStudent => ({ id, first: `First${id}`, last: `Last${id}`, pronoun: null, points: null });

const entry = (ballot: number, id: number, side: number, students: number[]): BallotEntry => ({
	ballot,
	entry: id,
	code: `CODE${id}`,
	side,
	notes: null,
	doubled: 0,
	comments: null,
	points: null,
	Students: students.map(student),
});

// An LD ballot: entry 1 on Aff on ballot 11 (student 101), entry 2 on Neg on ballot 12
// (student 201), counting wins and points from 20 to 30 in halves, low-point wins confirmed
const rules = (overrides: { scoring?: Partial<ValidateBallotRules['scoring']>, Entries?: BallotEntry[] } = {}): ValidateBallotRules => ({
	scoring: {
		winloss: { lpw: 'confirm' },
		points: { min: 20, max: 30, step: 0.5, ties: false, team: false },
		feedback: { rfd: null, minWords: { rfd: null, comments: null }, editableUntil: null },
		...overrides.scoring,
	},
	Entries: overrides.Entries ?? [entry(11, 1, 1, [101]), entry(12, 2, 2, [201])],
});

// Aff wins 29 to 28. validateBallot checks feedback from the rules, so it's left empty here
const submission = (overrides: Partial<DebateBallotSubmission> = {}): DebateBallotSubmission => ({
	eventType: 'debate',
	winner: 11,
	lowPointWin: false,
	points: [
		{ student: 101, points: 29 },
		{ student: 201, points: 28 },
	],
	feedback: { rfd: null, Entries: [] },
	...overrides,
});

const points = (aff: number | null, neg: number | null) => [
	{ student: 101, points: aff },
	{ student: 201, points: neg },
];

describe('validateBallot', () => {
	it('accepts a complete ballot', () => {
		expect(validateBallot(rules(), submission())).toEqual([]);
	});

	describe('winner', () => {
		it('requires a winner', () => {
			expect(validateBallot(rules(), submission({ winner: null }))).toEqual([{
				field: 'winner',
				message: 'You didn\'t choose a winner. There are no ties in debate, though there are sometimes tears. Be strong.',
			}]);
		});

		it('rejects a winner that isn\'t one of the judge\'s ballots', () => {
			expect(validateBallot(rules(), submission({ winner: 99 }))).toEqual([{
				field: 'winner',
				message: 'That winner isn\'t on your ballot.',
			}]);
		});

		it('ignores the winner when the round doesn\'t count wins', () => {
			const noWinloss = rules({ scoring: { winloss: undefined } });

			expect(validateBallot(noWinloss, submission({ winner: null }))).toEqual([]);
		});
	});

	describe('points', () => {
		it('requires points for every student', () => {
			expect(validateBallot(rules(), submission({ points: points(29, null) }))).toEqual([{
				field: 'points',
				student: 201,
				message: 'Points missing for First201 Last201.',
			}]);
		});

		it('treats a student left out of the submission as missing', () => {
			expect(validateBallot(rules(), submission({ points: [{ student: 101, points: 29 }] }))).toEqual([{
				field: 'points',
				student: 201,
				message: 'Points missing for First201 Last201.',
			}]);
		});

		it('rejects points for a student who isn\'t on the ballot', () => {
			const extra = [...points(29, 28), { student: 999, points: 27 }];

			expect(validateBallot(rules(), submission({ points: extra }))).toEqual([{
				field: 'points',
				student: 999,
				message: 'That student isn\'t on your ballot.',
			}]);
		});

		it('rejects points entered twice for one student', () => {
			const twice = [...points(29, 28), { student: 101, points: 27 }];

			expect(validateBallot(rules(), submission({ points: twice }))).toEqual([{
				field: 'points',
				student: 101,
				message: 'Points were entered twice for First101 Last101.',
			}]);
		});

		it.each([
			[19.5, 'below'],
			[30.5, 'above'],
		])('rejects %s, %s the range', (value) => {
			expect(validateBallot(rules(), submission({ points: points(value, 28) }))).toEqual([{
				field: 'points',
				student: 101,
				message: `Points ${value} are outside of range 20 - 30.`,
			}]);
		});

		it('accepts the ends of the range', () => {
			expect(validateBallot(rules(), submission({ points: points(30, 20) }))).toEqual([]);
		});

		it('rejects points that aren\'t a multiple of the step', () => {
			expect(validateBallot(rules(), submission({ points: points(28.7, 28) }))).toEqual([{
				field: 'points',
				student: 101,
				message: 'Points 28.7 must be in steps of 0.5.',
			}]);
		});

		it.each([
			[0.1, 28.3],
			[0.25, 28.75],
			[1, 28],
		])('accepts steps of %s like %s despite float rounding', (step, value) => {
			const scoring = { points: { min: 20, max: 30, step, ties: false, team: false } };

			expect(validateBallot(rules({ scoring }), submission({ points: points(value, 27) }))).toEqual([]);
		});

		it('rejects tied points', () => {
			expect(validateBallot(rules(), submission({ points: points(28, 28) }))).toEqual([{
				field: 'points',
				student: 201,
				message: 'Tied points forbidden: you have two speakers with points 28.',
			}]);
		});

		it('allows tied points when the event allows them', () => {
			const scoring = { points: { min: 20, max: 30, step: 0.5, ties: true, team: false } };

			expect(validateBallot(rules({ scoring }), submission({ points: points(28, 28) }))).toEqual([]);
		});

		it('ignores points when the round has none', () => {
			const noPoints = rules({ scoring: { points: undefined, winloss: { lpw: null } } });

			expect(validateBallot(noPoints, submission({ points: [] }))).toEqual([]);
		});
	});

	describe('low-point wins', () => {
		it('asks the judge to confirm a low-point win', () => {
			expect(validateBallot(rules(), submission({ points: points(27, 28) }))).toEqual([{
				field: 'lowPointWin',
				message: 'Please mark if the low-point win is intended. (Winner has 27, loser has 28)',
			}]);
		});

		it('accepts a confirmed low-point win', () => {
			expect(validateBallot(rules(), submission({ points: points(27, 28), lowPointWin: true }))).toEqual([]);
		});

		it('rejects a low-point win the event forbids, even when marked', () => {
			const forbid = rules({ scoring: { winloss: { lpw: 'forbid' } } });

			expect(validateBallot(forbid, submission({ points: points(27, 28), lowPointWin: true }))).toEqual([{
				field: 'lowPointWin',
				message: 'Low point wins are not allowed by this tournament. Please fix points.',
			}]);
		});

		it('rejects a marked low-point win that isn\'t one', () => {
			expect(validateBallot(rules(), submission({ lowPointWin: true }))).toEqual([{
				field: 'lowPointWin',
				message: 'You marked the low-point win box but this isn\'t a low point win. (Winner has 29, loser has 28)',
			}]);
		});

		it('accepts equal points either way', () => {
			const scoring = { points: { min: 20, max: 30, step: 0.5, ties: true, team: false } };

			expect(validateBallot(rules({ scoring }), submission({ points: points(28, 28) }))).toEqual([]);
			expect(validateBallot(rules({ scoring }), submission({ points: points(28, 28), lowPointWin: true }))).toEqual([]);
		});

		it('compares entry totals for teams', () => {
			const teams = rules({ Entries: [entry(11, 1, 1, [101, 102]), entry(12, 2, 2, [201, 202])] });
			const teamPoints = [
				{ student: 101, points: 29 },
				{ student: 102, points: 26 },
				{ student: 201, points: 28 },
				{ student: 202, points: 27.5 },
			];

			expect(validateBallot(teams, submission({ points: teamPoints }))).toEqual([{
				field: 'lowPointWin',
				message: 'Please mark if the low-point win is intended. (Winner has 55, loser has 55.5)',
			}]);
		});

		it('skips the check when the entries have different numbers of students', () => {
			const uneven = rules({ Entries: [entry(11, 1, 1, [101]), entry(12, 2, 2, [201, 202])] });
			const unevenPoints = [...points(29, 28), { student: 202, points: 27 }];

			expect(validateBallot(uneven, submission({ points: unevenPoints }))).toEqual([]);
		});

		it('skips the check until every student has points', () => {
			expect(validateBallot(rules(), submission({ points: points(null, 28) }))).toEqual([{
				field: 'points',
				student: 101,
				message: 'Points missing for First101 Last101.',
			}]);
		});
	});

	describe('reason for decision', () => {
		const rfdRules = (rfd: string | null, min = 5) => rules({
			scoring: { feedback: { rfd, minWords: { rfd: min, comments: null }, editableUntil: null } },
		});

		it('requires the saved RFD to have the minimum words', () => {
			expect(validateBallot(rfdRules('<p>Aff won on <b>framework</b></p>'), submission())).toEqual([{
				field: 'rfd',
				message: 'This tournament requires a Reason for Decision. Please leave at least 5 words. (You left 4)',
			}]);
		});

		it('counts a missing RFD as no words', () => {
			expect(validateBallot(rfdRules(null), submission())).toEqual([{
				field: 'rfd',
				message: 'This tournament requires a Reason for Decision. Please leave at least 5 words. (You left 0)',
			}]);
		});

		it('accepts an RFD with enough words', () => {
			expect(validateBallot(rfdRules('<p>Aff won on framework.</p><p>Neg dropped it.</p>'), submission())).toEqual([]);
		});

	});

	describe('comments', () => {
		const commentRules = (affComments: string | null, negComments: string | null, min = 3) => rules({
			scoring: { feedback: { rfd: null, minWords: { rfd: null, comments: min }, editableUntil: null } },
			Entries: [
				{ ...entry(11, 1, 1, [101]), comments: affComments },
				{ ...entry(12, 2, 2, [201]), comments: negComments },
			],
		});

		it('requires each entry\'s saved comments to have the minimum words', () => {
			expect(validateBallot(commentRules('<p>Great cross ex</p>', '<p>Slow down</p>'), submission())).toEqual([{
				field: 'comments',
				ballot: 12,
				message: 'Please leave at least 3 words of feedback for CODE2. (You left 2)',
			}]);
		});

		it('counts missing comments as no words', () => {
			expect(validateBallot(commentRules(null, null), submission()).map(error => error.ballot)).toEqual([11, 12]);
		});

		it('accepts comments with enough words', () => {
			expect(validateBallot(commentRules('Great cross ex', 'Please slow down'), submission())).toEqual([]);
		});

		it('doesn\'t check comments when no minimum is set', () => {
			expect(validateBallot(commentRules(null, null, 0), submission())).toEqual([]);
		});
	});

	it('returns every error at once', () => {
		expect(validateBallot(rules(), submission({ winner: null, points: points(31, 28) })).map(error => error.field)).toEqual(['winner', 'points']);
	});
});

describe('countWords', () => {
	it.each([
		[null, 0],
		['', 0],
		['<p>&nbsp;</p>', 0],
		['<p>one two</p><p>three</p>', 3],
		['one  two\nthree', 3],
		['<p>caf&eacute; &amp; more</p>', 3],
	])('counts %j as %i words', (html, count) => {
		expect(countWords(html)).toBe(count);
	});
});
