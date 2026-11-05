/*
 * Mock /user/home responses for the redesign stories, in the API's shape.
 *
 * "Now" in every scenario is Saturday, November 7, 2026, 10:40 a.m. CT,
 * during round 3 of the Bluebonnet Classic. Times are ISO UTC, as the
 * endpoint sends them; the components format them in the tourn's time zone.
 *
 * Each role has its data for a running, an upcoming, and a just-finished
 * tournament, and tourn(phase, roles) puts the roles a person holds onto
 * one HomeTourn, so every role combination draws from the same data.
 */
import type {
	CurrentBallot,
	Fine,
	HomeAlerts,
	HomeJudge,
	HomeResponse,
	HomeRole,
	HomeRound,
	HomeSchool,
	HomeTourn,
	Strike,
} from '@tabroom/types';
import type { Phase } from '../../../../../routes/user/home/tasks';

export const now = '2026-11-07T16:40:00Z';

/* People */

// Coach at Lakeside High School who also judges and runs one tournament
export const avery = {
	id      : 4410,
	first   : 'Avery',
	last    : 'Quinn',
	email   : 'aquinn@lakesideisd.example',
	chapter : { id: 801, name: 'Lakeside High School' },
};

// Public Forum competitor at Lakeside
export const maya = {
	id      : 5520,
	first   : 'Maya',
	last    : 'Chen',
	email   : 'maya.chen@student.example',
	chapter : { id: 801, name: 'Lakeside High School' },
};

const lakeside = { id: 1701, name: 'Lakeside High School' };

/* Builders for the nested rows that repeat */

const schoolStrike = (id: number, school: number, name: string): Strike => ({
	id, type: 'school', start: null, end: null, school, School: { name }, entry: null, Entry: null,
});

const entryStrike = (id: number, entry: number, code: string): Strike => ({
	id, type: 'entry', start: null, end: null, school: null, School: null, entry, Entry: { code },
});

const timeStrike = (id: number, type: 'time' | 'departure', start: string, end: string | null): Strike => ({
	id, type, start, end, school: null, School: null, entry: null, Entry: null,
});

type QuizState = 'done' | 'todo' | 'unapproved';

// unapproved: completed, but the quiz needs NSDA Learn approval and has none yet
const quiz = (id: number, label: string, requiredBy: string, state: QuizState): HomeJudge['Quizzes'][number] => ({
	Quiz       : { id, label, approval: state === 'unapproved' ? 1 : 0 },
	requiredBy,
	PersonQuiz : state === 'todo' ? null : { completed: 1, approved_by: null, pending: state === 'unapproved' ? 1 : 0 },
});

const fine = (id: number, amount: number, reason: string, leviedAt: string, judge?: { id: number, first: string, last: string }): Fine => ({
	id,
	reason,
	amount,
	currency   : '$',
	school     : lakeside.id,
	schoolName : lakeside.name,
	judge      : judge?.id ?? null,
	Judge      : judge ? { first: judge.first, last: judge.last } : null,
	leviedAt,
});

const sam = { id: 4415, first: 'Sam', last: 'Ortiz' };

type RoundSpec = {
	id        : number,
	name      : number,
	label?    : string,
	type?     : string,
	start?    : string,
	side      : number | null,
	room?     : HomeRound['Room'],
	opponent  : string,
	judges    : [string, string][],
	win?      : boolean, // left out while the round has no results
	points?   : number,
	flipAt?   : string,
};

// Maya's PF rounds; points are hers (student 9001), one per judge
const pfRound = (spec: RoundSpec): HomeRound => {
	const judges = spec.judges.map(([first, last], idx) => ({ id: spec.id * 10 + idx, first, last, code: null }));
	return {
		id             : spec.id,
		name           : spec.name,
		label          : spec.label ?? null,
		type           : spec.type ?? 'prelim',
		published      : 1,
		post_primary   : 1,
		post_secondary : 1,
		post_feedback  : 1,
		start          : spec.start ?? null,
		side           : spec.side,
		speakerorder   : null,
		Panel          : {
			id          : spec.id + 20000,
			letter      : '1',
			flight      : 1,
			bye         : 0,
			flip_at     : spec.flipAt ?? null,
			flip_status : spec.flipAt ? 'winner' : null,
		},
		Room           : spec.room ?? null,
		Opponents      : [{ entry: spec.id + 50000, code: spec.opponent }],
		Judges         : judges,
		Scores         : spec.win === undefined ? [] : judges.flatMap(judge => [
			{ judge: judge.id, tag: 'winloss', value: spec.win ? 1 : 0, student: null },
			...(spec.points === undefined ? [] : [{ judge: judge.id, tag: 'point', value: spec.points, student: 9001 }]),
		]),
		strikesDue     : null,
	};
};

/* Ballots, in the real CurrentBallot shape so Ballot.svelte renders them */

const baseBallot: CurrentBallot = {
	id           : 90311,
	name         : 3,
	flight       : null,
	show_async   : false,
	onlineBallots: true,
	flipStatus   : null,
	legion       : false,
	label        : null,
	JudgeId      : 4410,
	RoundId      : 7701,
	roomId       : 214,
	Room         : { name: 'Room 214', joinable: false, hybrid: false, mapUrl: null },
	roomNotes    : null,
	tourn        : 31201,
	start        : '2026-11-07T17:00:00Z',
	deadline     : '2026-11-07T19:00:00Z',
	end          : '2026-11-07T19:00:00Z',
	status       : 'not_started',
	startText    : null,
	ballotText   : null,
	chair        : true,
	TournTz      : 'America/Chicago',
	eventName    : 'Lincoln-Douglas Debate',
	eventAbbr    : 'LD',
	eventType    : 'debate',
	onlineMode   : null,
	Entries      : [
		{ id: 1, side: 'Aff', speakerOrder: null, code: 'Westlake MR' },
		{ id: 2, side: 'Neg', speakerOrder: null, code: 'Cedar Park TJ' },
	],
};

export const ballots = {
	ldRound3        : baseBallot,
	ldRound3Online  : {
		...baseBallot,
		Room       : { name: 'LD Room A', joinable: true, hybrid: false, mapUrl: null },
		onlineMode : 'nsda_campus',
	} satisfies CurrentBallot,
	// Entered and audited this morning; only its feedback can still change
	ldRound2Audited : {
		...baseBallot,
		id       : 90211,
		name     : 2,
		RoundId  : 7700,
		Room     : { name: 'Room 210', joinable: false, hybrid: false, mapUrl: null },
		start    : '2026-11-07T14:30:00Z',
		deadline : '2026-11-07T16:00:00Z',
		end      : '2026-11-07T16:00:00Z',
		status   : 'confirmed',
		Entries  : [
			{ id: 3, side: 'Aff', speakerOrder: null, code: 'Plano East RS' },
			{ id: 4, side: 'Neg', speakerOrder: null, code: 'Reagan MO' },
		],
	} satisfies CurrentBallot,
	ldRound3Flight2 : {
		...baseBallot,
		id         : 90312,
		flight     : 2,
		roomNotes  : 'Back of the gym, use the side door',
		ballotText : 'Submit your RFD before the next round.',
	} satisfies CurrentBallot,
	oiRound2 : {
		...baseBallot,
		id        : 90321,
		name      : 2,
		eventName : 'Oral Interpretation',
		eventAbbr : 'OI',
		eventType : 'speech',
		chair     : false,
		Entries   : [
			{ id: 11, side: null, speakerOrder: 2, code: 'Lee KM' },
			{ id: 12, side: null, speakerOrder: 1, code: 'Bush RS' },
			{ id: 13, side: null, speakerOrder: 3, code: 'Tran AB' },
		],
	} satisfies CurrentBallot,
	// Ballot in, still running the chamber until noon
	congressChairSession : {
		...baseBallot,
		id        : 90331,
		name      : 2,
		eventName : 'Congressional Debate',
		eventAbbr : 'CON',
		eventType : 'congress',
		status    : 'confirmed',
		start     : '2026-11-07T15:00:00Z',
		end       : '2026-11-07T18:00:00Z',
		Entries   : [],
	} satisfies CurrentBallot,
	mockTrialChairSession : {
		...baseBallot,
		id        : 90341,
		name      : 1,
		eventName : 'Mock Trial',
		eventAbbr : 'MT',
		eventType : 'mock_trial',
		status    : 'confirmed',
		start     : '2026-11-07T15:00:00Z',
		end       : '2026-11-07T18:00:00Z',
		Entries   : [
			{ id: 21, side: 'Prosecution', speakerOrder: null, code: 'Lakeside A' },
			{ id: 22, side: 'Defense', speakerOrder: null, code: 'Westlake B' },
		],
	} satisfies CurrentBallot,
	wudcPanelist : {
		...baseBallot,
		id        : 90351,
		eventName : 'British Parliamentary',
		eventAbbr : 'BP',
		eventType : 'wudc',
		chair     : false,
		Entries   : [
			{ id: 31, side: '1G', speakerOrder: 1, code: 'Lakeside AB' },
			{ id: 32, side: '1O', speakerOrder: 2, code: 'Westlake CD' },
			{ id: 33, side: '2G', speakerOrder: 3, code: 'Reagan EF' },
			{ id: 34, side: '2O', speakerOrder: 4, code: 'Plano GH' },
		],
	} satisfies CurrentBallot,
	ldRound3Async : {
		...baseBallot,
		id         : 90361,
		onlineMode : 'async',
		Room       : null,
	} satisfies CurrentBallot,
	ldRound3Paper : {
		...baseBallot,
		id            : 90371,
		onlineBallots : false,
	} satisfies CurrentBallot,
	legionRound2Audited : {
		...baseBallot,
		id        : 90381,
		name      : 2,
		eventName : 'American Legion Oratorical',
		eventAbbr : 'AL',
		eventType : 'speech',
		legion    : true,
		status    : 'confirmed',
		end       : '2026-11-07T16:00:00Z',
	} satisfies CurrentBallot,
};

/* The three tournaments every role combination is shown at */

type TournBase = Omit<HomeTourn, 'roles' | 'LiveDocs' | 'OnlineRooms' | 'Judges' | 'Entries' | 'Schools' | 'Tab'>;

const tourns: Record<Phase, TournBase> = {
	running: {
		id        : 31201,
		name      : 'Bluebonnet Classic',
		city      : 'Austin',
		state     : 'TX',
		country   : 'US',
		tz        : 'America/Chicago',
		webname   : 'bluebonnet',
		start     : '2026-11-06T14:00:00Z',
		end       : '2026-11-08T00:00:00Z',
		reg_start : '2026-10-01T05:00:00Z',
		reg_end   : '2026-10-30T22:00:00Z',
		online    : false,
	},
	upcoming: {
		id        : 31377,
		name      : 'Gulf Coast Swing',
		city      : 'Houston',
		state     : 'TX',
		country   : 'US',
		tz        : 'America/Chicago',
		webname   : 'gulfcoast',
		start     : '2026-11-20T14:00:00Z',
		end       : '2026-11-23T00:00:00Z',
		reg_start : '2026-10-15T05:00:00Z',
		reg_end   : '2026-11-13T23:00:00Z',
		online    : false,
	},
	past: {
		id        : 30988,
		name      : 'Cypress Ridge Open',
		city      : 'Cypress',
		state     : 'TX',
		country   : 'US',
		tz        : 'America/Chicago',
		webname   : 'cypressridge',
		start     : '2026-10-30T21:00:00Z',
		end       : '2026-11-01T00:00:00Z',
		reg_start : '2026-09-20T05:00:00Z',
		reg_end   : '2026-10-23T22:00:00Z',
		online    : false,
	},
};

/* What each role contributes to a tourn, per phase */

type RolePart = Partial<Pick<HomeTourn, 'LiveDocs' | 'Judges' | 'Entries' | 'Schools' | 'Tab'>>;

const ld = { id: 501, name: 'Lincoln-Douglas Debate', abbr: 'LD' };
const pf = { id: 511, name: 'Public Forum Debate', abbr: 'PF' };

const runningQuizzes = [
	quiz(301, 'Bluebonnet judge pledge', ld.name, 'done'),
	quiz(302, 'LD elim judge survey', 'LD Elims', 'todo'),
	quiz(303, 'NSDA Learn: adjudicating LD', 'LD Elims', 'unapproved'),
];

const upcomingQuizzes = [
	quiz(311, 'Judge training: bias awareness', pf.name, 'todo'),
	quiz(312, 'Gulf Coast code of conduct', pf.name, 'todo'),
	quiz(313, 'NSDA Learn: adjudicating PF', 'PF Prelims', 'unapproved'),
];

const ldJudge: HomeJudge = {
	id             : 4410,
	code           : 'LK3',
	obligation     : 6,
	hired          : null,
	active         : 1,
	category       : ld.id,
	Category       : ld,
	school         : lakeside.id,
	School         : lakeside,
	Jpools         : [
		{ id: 601, name: 'LD Prelims', site: null, Site: null, message: null },
		{ id: 602, name: 'LD Elims', site: 81, Site: { name: 'Lakeside High' }, message: 'Check in at the judge table by 8:00 a.m.' },
	],
	Standbys       : [],
	Training       : null,
	roundsJudged   : 2,
	ballotsEntered : 2,
	ballotsOpen    : null,
	feedbackUntil  : '2026-11-08T00:00:00Z',
	Strikes        : [
		schoolStrike(701, 1810, 'Riverdale Prep'),
		schoolStrike(702, 1811, 'Westlake'),
		entryStrike(703, 51003, 'Clear Lake JN'),
		timeStrike(704, 'departure', '2026-11-08T00:00:00Z', null),
	],
	Quizzes        : runningQuizzes,
	CurrentBallots : [ballots.ldRound3, ballots.ldRound2Audited],
	Fines          : [fine(8801, 50, 'Did not judge round 1', '2026-11-06T23:45:00Z', avery)],
};

const lakesideFull = (school: Partial<Extract<HomeSchool, { access: 'full' }>>): HomeSchool => ({
	...lakeside,
	chapter     : avery.chapter.id,
	Prefs       : [],
	access      : 'full',
	onsite      : 0,
	Counts      : { entries: 0, events: 0, judges: 0 },
	Signups     : [],
	Onsite      : null,
	StrikeCards : [],
	Fines       : [],
	...school,
});

const parts: Record<Phase, Record<HomeRole, RolePart>> = {
	running: {
		judge: {
			LiveDocs : [{ category: ld.id, Category: { name: ld.name, abbr: ld.abbr }, url: '#livedoc-ld', caption: 'LD live doc' }],
			Judges   : [ldJudge],
		},
		competitor: {
			LiveDocs : [{ category: pf.id, Category: { name: pf.name, abbr: pf.abbr }, url: '#livedoc-pf', caption: null }],
			Entries  : [{
				id          : 7001,
				code        : 'Lakeside CN',
				name        : 'Chen & Nwosu',
				active      : 1,
				dropped     : 0,
				waitlist    : 0,
				unconfirmed : 0,
				supp        : false,
				event       : 521,
				Event       : { id: 521, name: pf.name, abbr: pf.abbr, type: 'debate' },
				school      : lakeside.id,
				Students    : [{ id: 9002, first: 'Theo', last: 'Nwosu' }],
				Prefs       : null,
				Rounds      : [
					pfRound({ id: 7703, name: 3, start: '2026-11-07T17:00:00Z', side: null, room: { name: 'Room 118', url: null }, opponent: 'Plano East RS', judges: [['Harper', 'Lin']], flipAt: '2026-11-07T16:50:00Z' }),
					pfRound({ id: 7702, name: 2, start: '2026-11-07T14:30:00Z', side: 2, room: { name: 'Room 122', url: null }, opponent: 'Cedar Park KM', judges: [['Sam', 'Alvarez']], win: false, points: 28.4 }),
					pfRound({ id: 7701, name: 1, start: '2026-11-06T23:00:00Z', side: 1, room: { name: 'Room 109', url: null }, opponent: 'Westlake AB', judges: [['Dana', 'Okafor']], win: true, points: 28.9 }),
				],
			}],
		},
		coach: {
			Schools: [lakesideFull({
				onsite      : 1,
				Counts      : { entries: 12, events: 4, judges: 3 },
				StrikeCards : [
					{ round: 7731, Round: { name: 8, label: 'PF Quarters' }, due: '2026-11-07T18:30:00Z' },
					{ round: 7741, Round: { name: 8, label: 'LD Quarters' }, due: '2026-11-07T18:30:00Z' },
				],
				// Newest first; judge fines name the judge, Avery's own included
				Fines       : [
					fine(8803, 50, 'Did not judge round 2', '2026-11-07T14:50:00Z', sam),
					fine(8801, 50, 'Did not judge round 1', '2026-11-06T23:45:00Z', avery),
					fine(8802, 25, 'Lakeside RW dropped from Public Forum Debate after the deadline', '2026-11-06T22:10:00Z'),
				],
			})],
		},
		tab: {
			Tab: { tag: 'tabber', details: null, Counts: { schools: 24, entries: 312 }, resultsPublished: false },
		},
	},

	upcoming: {
		judge: {
			Judges: [{
				...ldJudge,
				id             : 4588,
				code           : null,
				category       : pf.id,
				Category       : pf,
				Jpools         : [{ id: 611, name: 'PF Prelims', site: null, Site: null, message: null }, { id: 612, name: 'PF Elims', site: null, Site: null, message: null }],
				roundsJudged   : 0,
				ballotsEntered : 0,
				ballotsOpen    : '2026-11-20T14:00:00Z',
				feedbackUntil  : null,
				Strikes        : [
					schoolStrike(711, 1810, 'Riverdale Prep'),
					timeStrike(712, 'time', '2026-11-22T20:00:00Z', '2026-11-23T00:00:00Z'),
				],
				Quizzes        : upcomingQuizzes,
				CurrentBallots : [],
				Fines          : [],
			}],
		},
		competitor: {
			Entries: [{
				id          : 7105,
				code        : 'Lakeside CN',
				name        : 'Chen & Nwosu',
				active      : 1,
				dropped     : 0,
				waitlist    : 0,
				unconfirmed : 0,
				supp        : false,
				event       : 531,
				Event       : { id: 531, name: pf.name, abbr: pf.abbr, type: 'debate' },
				school      : lakeside.id,
				Students    : [{ id: 9002, first: 'Theo', last: 'Nwosu' }],
				Prefs       : { type: 'ordinals', start: '2026-11-02T14:00:00Z', end: '2026-11-19T02:00:00Z' },
				Rounds      : [],
			}, {
				id          : 7106,
				code        : 'Lakeside 114',
				name        : 'Maya Chen',
				active      : 0,
				dropped     : 0,
				waitlist    : 0,
				unconfirmed : 1,
				supp        : false,
				event       : 532,
				Event       : { id: 532, name: 'Extemporaneous Speaking', abbr: 'USX', type: 'speech' },
				school      : lakeside.id,
				Students    : [],
				Prefs       : null,
				Rounds      : [],
			}],
		},
		coach: {
			Schools: [lakesideFull({
				Prefs   : [{ category: pf.id, Category: { name: pf.name, abbr: pf.abbr }, start: '2026-11-02T14:00:00Z', end: '2026-11-19T02:00:00Z', entries: 4 }],
				Counts  : { entries: 18, events: 5, judges: 4 },
				Signups : [
					{ entry: 7106, Student: { first: 'Maya', last: 'Chen' }, Event: { abbr: 'USX' } },
					{ entry: 7107, Student: { first: 'Jo', last: 'Park' }, Event: { abbr: 'LD' } },
				],
				Onsite  : { start: '2026-11-20T12:00:00Z', end: '2026-11-20T15:00:00Z' },
			})],
		},
		tab: {
			Tab: { tag: 'owner', details: null, Counts: { schools: 18, entries: 140 }, resultsPublished: false },
		},
	},

	past: {
		judge: {
			Judges: [{
				...ldJudge,
				id             : 4102,
				roundsJudged   : 7,
				ballotsEntered : 7,
				feedbackUntil  : '2026-11-01T00:00:00Z',
				Strikes        : [],
				Quizzes        : [
					quiz(321, 'Cypress Ridge judge pledge', ld.name, 'done'),
					quiz(322, 'LD elim judge survey', 'LD Elims', 'done'),
					quiz(323, 'NSDA Learn: adjudicating LD', 'LD Elims', 'done'),
				],
				CurrentBallots : [],
				Fines          : [fine(8701, 50, 'Did not judge round 5', '2026-10-31T14:15:00Z', avery)],
			}],
		},
		competitor: {
			Entries: [{
				id          : 6801,
				code        : 'Lakeside CN',
				name        : 'Chen & Nwosu',
				active      : 1,
				dropped     : 0,
				waitlist    : 0,
				unconfirmed : 0,
				supp        : false,
				event       : 541,
				Event       : { id: 541, name: pf.name, abbr: pf.abbr, type: 'debate' },
				school      : lakeside.id,
				Students    : [{ id: 9002, first: 'Theo', last: 'Nwosu' }],
				Prefs       : null,
				Rounds      : [
					pfRound({ id: 6907, name: 7, label: 'Octafinals', type: 'elim', side: 2, opponent: 'Jasper PS', judges: [['Kim', 'Brooks'], ['Lee', 'Reyes'], ['Ana', 'Nguyen']], win: false }),
					pfRound({ id: 6906, name: 6, side: 1, opponent: 'Reagan MO', judges: [['Ana', 'Nguyen']], win: true, points: 28.8 }),
					pfRound({ id: 6905, name: 5, side: 2, opponent: 'Clear Lake JN', judges: [['Lee', 'Brooks']], win: true, points: 28.7 }),
					pfRound({ id: 6904, name: 4, side: 1, opponent: 'Plano East RS', judges: [['Harper', 'Lin']], win: false, points: 28.2 }),
					pfRound({ id: 6903, name: 3, side: 2, opponent: 'Westlake AB', judges: [['Dana', 'Okafor']], win: true, points: 28.9 }),
					pfRound({ id: 6902, name: 2, side: 1, opponent: 'Cedar Park KM', judges: [['Sam', 'Alvarez']], win: false, points: 28.1 }),
					pfRound({ id: 6901, name: 1, side: 2, opponent: 'Austin LBJ VK', judges: [['Tomás', 'Reyes']], win: true, points: 28.9 }),
				],
			}],
		},
		coach: {
			Schools: [lakesideFull({
				onsite : 1,
				Counts : { entries: 15, events: 5, judges: 4 },
				Fines  : [
					fine(8701, 50, 'Did not judge round 5', '2026-10-31T14:15:00Z', avery),
					fine(8702, 50, 'Did not judge round 2', '2026-10-30T23:40:00Z', sam),
				],
			})],
		},
		tab: {
			Tab: { tag: 'owner', details: null, Counts: { schools: 21, entries: 260 }, resultsPublished: false },
		},
	},
};

/*
 * The tourn as /user/home returns it for a person holding `roles` there.
 * Live docs merge without repeats, as two roles can share a category's doc.
 */
export function tourn(phase: Phase, roles: HomeRole[]): HomeTourn {
	const held = roles.map(role => parts[phase][role]);
	return {
		...tourns[phase],
		roles,
		LiveDocs    : held.flatMap(p => p.LiveDocs ?? []).filter((doc, idx, all) => all.findIndex(d => d.url === doc.url) === idx),
		OnlineRooms : [],
		Judges      : held.flatMap(p => p.Judges ?? []),
		Entries     : held.flatMap(p => p.Entries ?? []),
		Schools     : held.flatMap(p => p.Schools ?? []),
		Tab         : held.find(p => p.Tab)?.Tab ?? null,
	};
}

export const phases: Phase[] = ['running', 'upcoming', 'past'];

/* Named tourns the page and edge-case stories use */

export const bluebonnetCoachJudge = tourn('running', ['judge', 'coach']);
export const gulfCoastCoachJudge = tourn('upcoming', ['judge', 'coach']);
export const cypressCoachJudge = tourn('past', ['judge', 'coach']);
export const bluebonnetCompetitor = tourn('running', ['competitor']);
export const gulfCoastCompetitor = tourn('upcoming', ['competitor']);
export const cypressCompetitor = tourn('past', ['competitor']);

// A tournament Avery runs and has no other role at
export const noviceNightTab: HomeTourn = {
	id          : 31490,
	name        : 'Lakeside Novice Night',
	city        : 'Dallas',
	state       : 'TX',
	country     : 'US',
	tz          : 'America/Chicago',
	webname     : 'lakesidenovice',
	start       : '2026-12-04T22:00:00Z',
	end         : '2026-12-05T04:00:00Z',
	reg_start   : '2026-11-09T14:00:00Z',
	reg_end     : '2026-12-01T23:00:00Z',
	online      : false,
	roles       : ['tab'],
	LiveDocs    : [],
	OnlineRooms : [],
	Judges      : [],
	Entries     : [],
	Schools     : [],
	Tab         : { tag: 'owner', details: null, Counts: { schools: 7, entries: 40 }, resultsPublished: false },
};

/* Edge case: elims at Bluebonnet with ten conflicts and nine questionnaires */

export const bluebonnetBusy: HomeTourn = {
	...bluebonnetCoachJudge,
	Judges: [{
		...ldJudge,
		Strikes : [
			schoolStrike(721, 1810, 'Riverdale Prep'),
			schoolStrike(722, 1812, 'Plano East'),
			schoolStrike(723, 1811, 'Westlake'),
			schoolStrike(724, 1813, 'Cedar Park'),
			schoolStrike(725, 1814, 'Austin LBJ'),
			entryStrike(726, 51003, 'Clear Lake JN'),
			entryStrike(727, 51004, 'Reagan MO'),
			entryStrike(728, 51005, 'Jasper PS'),
			timeStrike(729, 'time', '2026-11-07T14:00:00Z', '2026-11-07T16:00:00Z'),
			timeStrike(730, 'departure', '2026-11-08T00:00:00Z', null),
		],
		Quizzes : [
			quiz(331, 'Bluebonnet judge pledge', ld.name, 'done'),
			quiz(332, 'LD elim judge survey', 'LD Elims', 'todo'),
			quiz(333, 'Elim availability form', 'LD Elims', 'todo'),
			quiz(334, 'Judge training: bias awareness', ld.name, 'todo'),
			quiz(335, 'Paradigm acknowledgment', 'LD Elims', 'todo'),
			quiz(336, 'Tournament code of conduct', ld.name, 'todo'),
			quiz(337, 'Judge training: speech events', 'Speech Flex', 'todo'),
			quiz(338, 'NSDA Learn: adjudicating LD', 'LD Elims', 'unapproved'),
			quiz(339, 'NSDA Learn: cultural competency', ld.name, 'unapproved'),
		],
	}],
};

/* Edge case: two judge rows at one tourn, for the school and as a tournament hire in PF */

export const bluebonnetTwoJudgeRows: HomeTourn = {
	...tourn('running', ['judge']),
	Judges: [ldJudge, {
		...ldJudge,
		id             : 4499,
		code           : 'H12',
		obligation     : null,
		hired          : 3,
		category       : pf.id,
		Category       : pf,
		school         : null,
		School         : null,
		Jpools         : [{ id: 621, name: 'PF Prelims', site: null, Site: null, message: null }],
		roundsJudged   : 1,
		ballotsEntered : 1,
		Strikes        : [],
		Quizzes        : [quiz(341, 'Bluebonnet judge pledge', pf.name, 'done')],
		CurrentBallots : [],
		Fines          : [],
	}],
};

/* Edge case: a coach who may only fill in pref sheets for the school */

export const gulfCoastPrefsOnly: HomeTourn = {
	...tourn('upcoming', ['coach']),
	Schools: [{
		...lakeside,
		chapter : avery.chapter.id,
		access  : 'prefs',
		Prefs   : [
			{ category: pf.id, Category: { name: pf.name, abbr: pf.abbr }, start: '2026-11-02T14:00:00Z', end: '2026-11-19T02:00:00Z', entries: 4 },
			{ category: ld.id, Category: { name: ld.name, abbr: ld.abbr }, start: '2026-11-02T14:00:00Z', end: '2026-11-19T02:00:00Z', entries: 3 },
		],
	}],
};

/*
 * Edge case: the same weekend held online. The ballot's room joins online,
 * the competitor's current round links its room, and the squad, prep, and
 * tournament rooms ride beside the live docs until the tournament ends.
 */
const online = { name: 'Bluebonnet Online', webname: 'bluebonnetonline', city: null, state: null, online: true };

const room = (kind: 'school' | 'prep' | 'utility', id: number, name: string) => ({ kind, id, name, joinable: true, hybrid: false, mapUrl: null });

export const bluebonnetOnlineCoachJudge: HomeTourn = {
	...bluebonnetCoachJudge,
	...online,
	OnlineRooms : [room('school', lakeside.id, 'Lakeside squad room'), room('utility', 3, 'Judge lounge')],
	Judges      : [{ ...ldJudge, CurrentBallots: [ballots.ldRound3Online] }],
};

// Judging only, online: the Campus ballot's row carries its join button
export const bluebonnetOnlineJudge: HomeTourn = {
	...tourn('running', ['judge']),
	...online,
	OnlineRooms : [room('utility', 3, 'Judge lounge')],
	Judges      : [{ ...ldJudge, CurrentBallots: [ballots.ldRound3Online] }],
};

// On standby for round 4 this afternoon, and the sample ballot still to judge
export const bluebonnetStandbyTraining: HomeTourn = {
	...tourn('running', ['judge']),
	Judges : [{
		...ldJudge,
		CurrentBallots : [],
		Standbys       : [{
			jpool    : 603,
			name     : 'LD Standby R4',
			Site     : { name: 'Lakeside High' },
			message  : 'Wait in the judge lounge, room 112.',
			Timeslot : { name: 'Round 4', start: '2026-11-07T19:00:00Z', end: '2026-11-07T21:00:00Z' },
		}],
		Training       : { event: 5101, Event: { abbr: 'LD', type: 'debate' } },
	}],
};

// Every kind of ballot row at once, for the ballot rows story
export const bluebonnetBallotRows: HomeTourn = {
	...bluebonnetCoachJudge,
	Judges : [{
		...ldJudge,
		CurrentBallots : [
			ballots.ldRound3Flight2,
			ballots.oiRound2,
			ballots.congressChairSession,
			ballots.mockTrialChairSession,
			ballots.wudcPanelist,
			ballots.ldRound3Async,
			ballots.ldRound3Paper,
		],
	}],
};

export const bluebonnetOnlineCompetitor: HomeTourn = {
	...bluebonnetCompetitor,
	...online,
	OnlineRooms : [
		room('school', lakeside.id, 'Lakeside squad room'),
		room('prep', 7001, 'Lakeside CN prep room'),
		room('utility', 4, 'Competitor commons'),
	],
	Entries     : bluebonnetCompetitor.Entries.map(entry => ({
		...entry,
		Rounds : entry.Rounds.map((round, idx) => ({
			...round,
			Room : { name: ['PF Room C', 'PF Room F', 'PF Room B'][idx] ?? null, url: idx === 0 ? '#campus-pf-r3-c' : null },
		})),
	})),
};

/* Alerts */

const noAlerts: HomeAlerts = { paradigmReview: null, emailUnconfirmed: false, tzMissing: false };

export const alerts = {
	none     : noAlerts,
	paradigm : { ...noAlerts, paradigmReview: { start: '2026-10-15T05:00:00Z', lastReviewed: '2026-03-02T19:20:00Z' } },
	all      : { paradigmReview: { start: '2026-10-15T05:00:00Z', lastReviewed: null }, emailUnconfirmed: true, tzMissing: true },
} satisfies Record<string, HomeAlerts>;

/* Whole responses, Tourns sorted by start then name as the endpoint does */

export const averyHome: HomeResponse = {
	now,
	Alerts : alerts.paradigm,
	Tourns : [cypressCoachJudge, bluebonnetCoachJudge, gulfCoastCoachJudge, noviceNightTab],
};

export const mayaHome: HomeResponse = {
	now,
	Alerts : alerts.none,
	Tourns : [cypressCompetitor, bluebonnetCompetitor, gulfCoastCompetitor],
};

export const emptyHome: HomeResponse = { now, Alerts: alerts.none, Tourns: [] };
