import type { CongressBallotContext, DebateBallotContext, MockTrialBallotContext } from '@tabroom/types';

// Shared ballot context fixtures. Each event type builds on baseContext and
// overrides what differs, so a story only spells out what it's showing.

type BallotBase = Omit<DebateBallotContext, 'eventType' | 'debate'>;

export const hoursFromNow = (hours: number) =>
	new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

type Feedback = NonNullable<BallotBase['scoring']['feedback']>;

// A feedback block with a reason for decision, nothing saved and an empty comments box for each
// entry, labelled with its code
export const feedbackFor = (Entries: { ballot: number, code: string | null }[], overrides: Partial<Feedback> = {}): Feedback => ({
	showRfd: true,
	rfd: null,
	Entries: Entries.map(({ ballot, code }) => ({ ballot, comments: null, entryLabel: code ?? '' })),
	minWords: { rfd: null, comments: null },
	...overrides,
});

export function baseContext(): BallotBase {
	return {
		status: 'started',
		chair: false,
		chairLabel: null,
		tz: 'America/Chicago',
		Tourn: { id: 1, end: hoursFromNow(48) },
		Event: { abbr: 'CX' },
		Round: { id: 1, name: 3, label: null, notes: null },
		flight: null,
		Room: { name: '204', joinable: false, hybrid: false, mapUrl: null },
		Judge: { code: 'Code', first: 'First', middle: null, last: 'Last' },
		topic: null,
		rules: [
			'<p>Please disclose your decision to the competitors after submitting your ballot.</p>',
		],
		ballotHeader: '<p>Tabroom.com and the tournament are committed to fair and equitable judging. Please evaluate each competitor on the arguments made in the round, without bias based on identity or appearance.</p>',
		roundStart: hoursFromNow(-0.5),
		decisionDeadline: hoursFromNow(2),
		onlineMode: null,
		scoring: {
			winloss: { lpw: 'forbid' },
			points: { min: 26, max: 30, step: 0.1, ties: false, team: false, ranksAgree: false },
			feedback: feedbackFor([]),
		},
		Entries: [],
		otherJudges: [],
		timers: { speech: 8, prep: 8 },
		pointScale: [],
		speechTimes: [],
		ballotTopics: null,
		docShare: null,
		logo: null,
	};
}

export function debateContext(overrides: Partial<DebateBallotContext> = {}): DebateBallotContext {
	const base = baseContext();
	const Entries: DebateBallotContext['Entries'] = [
		{
			ballot: 11,
			entry: 101,
			code: 'Northview AB',
			side: 1,
			notes: null,
			doubled: 0,
			points: null,
			Students: [
				{ id: 1001, first: 'Avery', middle: null, last: 'Brooks', pronoun: 'she/her', points: null },
				{ id: 1002, first: 'Sam', middle: null, last: 'Delgado', pronoun: 'they/them', points: null },
			],
		},
		{
			ballot: 12,
			entry: 102,
			code: 'Central CD',
			side: 2,
			notes: null,
			doubled: 0,
			points: null,
			Students: [
				{ id: 1003, first: 'Jordan', middle: null, last: 'Chen', pronoun: null, points: null },
				{ id: 1004, first: 'Riley', middle: null, last: 'Nakamura', pronoun: 'he/him', points: null },
			],
		},
	];

	return {
		...base,
		eventType: 'debate',
		topic: {
			label: 'Topic',
			text: 'Resolved: The United States federal government should significantly strengthen its protection of domestic intellectual property rights.',
		},
		scoring: { ...base.scoring, feedback: feedbackFor(Entries) },
		Entries,
		pointScale: [
			{ points: '30', description: 'Outstanding: top speaker at this tournament' },
			{ points: '28-29', description: 'Excellent: should be in elims' },
			{ points: '26-27', description: 'Above average' },
			{ points: '24-25', description: 'Average' },
			{ points: '0-23', description: 'Below 24 is reserved for offensive conduct' },
		],
		speechTimes: [
			{ speech: 'Constructives', time: '8 min' },
			{ speech: 'Cross-examination', time: '3 min' },
			{ speech: 'Rebuttals', time: '5 min' },
			{ speech: 'Prep time', time: '8 min each' },
		],
		debate: { affLabel: 'Aff', negLabel: 'Neg', sides: 'locked', flipStatus: null, winner: null },
		...overrides,
	};
}

export function mockTrialContext(overrides: Partial<MockTrialBallotContext> = {}): MockTrialBallotContext {
	const Entries: MockTrialBallotContext['Entries'] = [
		{
			ballot: 21,
			entry: 201,
			code: 'Lincoln Mock Trial',
			side: 1,
			notes: null,
			doubled: 0,
			points: null,
			Students: [
				{ id: 2001, first: 'Casey', middle: null, last: 'Ortiz', pronoun: null, points: null },
				{ id: 2002, first: 'Taylor', middle: null, last: 'Reed', pronoun: 'she/her', points: null },
			],
		},
		{
			ballot: 22,
			entry: 202,
			code: 'Westfield Mock Trial',
			side: 2,
			notes: null,
			doubled: 0,
			points: null,
			Students: [
				{ id: 2003, first: 'Jamie', middle: null, last: 'Park', pronoun: 'he/him', points: null },
				{ id: 2004, first: 'Quinn', middle: null, last: 'Foster', pronoun: null, points: null },
			],
		},
	];

	return {
		...baseContext(),
		eventType: 'mock_trial',
		Event: { abbr: 'MT' },
		Round: { id: 2, name: 2, label: null, notes: null },
		Room: { name: 'Courtroom 3B', joinable: false, hybrid: false, mapUrl: null },
		timers: null,
		// As with mock_trial_feedback set
		scoring: {
			points: { min: 1, max: 10, step: 1, ties: true, team: false, ranksAgree: false },
			feedback: feedbackFor(Entries),
		},
		Entries,
		pointScale: [
			{ points: '9-10', description: 'Excellent' },
			{ points: '7-8', description: 'Above average' },
			{ points: '5-6', description: 'Average' },
			{ points: '1-4', description: 'Below average' },
		],
		speechTimes: [
			{ speech: 'Opening statements', time: '5 min each' },
			{ speech: 'Direct examination', time: '25 min' },
			{ speech: 'Cross-examination', time: '20 min' },
			{ speech: 'Closing arguments', time: '9 min each' },
		],
		...overrides,
	};
}

const legislators = [
	['Northview AA', 'Avery', 'Brooks', 'she/her'],
	['Central AB', 'Sam', 'Delgado', 'they/them'],
	['Westfield AC', 'Jordan', 'Chen', null],
	['Lincoln AD', 'Riley', 'Nakamura', 'he/him'],
	['Eastside AE', 'Casey', 'Ortiz', null],
	['Riverside AF', 'Taylor', 'Reed', 'she/her'],
] as const;

export function congressContext(overrides: Partial<CongressBallotContext> = {}): CongressBallotContext {
	return {
		...baseContext(),
		eventType: 'congress',
		Event: { abbr: 'HSE' },
		Round: { id: 3, name: 2, label: null, notes: null },
		Room: { name: 'Auditorium', joinable: false, hybrid: false, mapUrl: null },
		timers: { speech: 3, prep: null },
		scoring: {
			points: { min: 1, max: 6, step: 1, ties: true, team: false, ranksAgree: true },
			ranks: {},
			// Only the chair gets feedback, and the Congress stories show a judge who isn't
		},
		Entries: legislators.map(([code, first, last, pronoun], index) => ({
			ballot: 31 + index,
			entry: 301 + index,
			code,
			side: 0,
			notes: null,
			doubled: 0,
			points: null,
			Students: [{ id: 3001 + index, first, middle: null, last, pronoun, points: null }],
		})),
		pointScale: [
			{ points: '6', description: 'Exceptional speech and refutation' },
			{ points: '4-5', description: 'Strong' },
			{ points: '1-3', description: 'Developing' },
		],
		speechTimes: [
			{ speech: 'Authorship / sponsorship', time: '3 min + 2 min questioning' },
			{ speech: 'Other speeches', time: '3 min + 1 min questioning' },
		],
		ballotTopics: '<ol><li>A Bill to Fund High-Speed Rail</li><li>A Resolution to Ratify the High Seas Treaty</li></ol>',
		...overrides,
	};
}
