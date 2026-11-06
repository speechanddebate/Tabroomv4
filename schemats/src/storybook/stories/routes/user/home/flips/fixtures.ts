/*
 * Each state of an online coin flip as /user/home returns it to an entry, a coach, and a
 * judge, built on the Bluebonnet Classic in ../fixtures.ts. "Now" is 10:40 a.m. CT, and the
 * competitor's PF round 3 flip is due at 10:50 a.m.
 *
 * Home only draws the entry's flip so far (the task row and "Flip" in the round table); the
 * coach's Flips count and the judge's flipStatus are here for the coach row and the
 * "Sides pending coin flip" line still to come.
 */
import type { CurrentBallot, HomeRound, HomeTourn } from '@tabroom/types';
import * as fx from '../fixtures';

type Flip = NonNullable<HomeRound['Panel']['Flip']>;

// The competitor's PF round 3, with its flip changed. Live docs are left out so only the flip shows
const entryFlip = (change: Partial<Flip>): HomeTourn => ({
	...fx.bluebonnetCompetitor,
	LiveDocs: [],
	Entries: fx.bluebonnetCompetitor.Entries.map(entry => ({
		...entry,
		Rounds: entry.Rounds.map(round => round.Panel.Flip
			? { ...round, Panel: { ...round.Panel, Flip: { ...round.Panel.Flip, ...change } } }
			: round),
	})),
});

export const entry = {
	// Won the toss in a side-only event: picks Aff or Neg
	wonSideOnly         : entryFlip({ teamOrder: false, labels: ['Aff', 'Neg'] }),
	// Won the toss in PF: picks a side or the speaking order
	wonSideOrOrder      : entryFlip({}),
	// Lost the toss; the winner took Pro, so this entry is Con and picks the speaking order
	lostNowMyTurn       : entryFlip({ won: false, turn: 'mine', side: 2 }),
	// Won the toss but let it time out; the other entry took Con, so the order comes back here
	wonHandedBack       : entryFlip({ won: true, turn: 'mine', side: 1 }),
	// Both turns ran out and flip_anyone_chooses is on: first to choose decides
	eitherMayChoose     : entryFlip({ won: false, turn: 'either' }),
	// The other entry won and is choosing; home has no waiting row yet
	opponentChoosing    : entryFlip({ won: false, turn: 'theirs' }),
	// This entry chose Pro and is waiting on the other entry's speaking-order pick
	waitingAfterMyPick  : entryFlip({ won: true, turn: 'theirs', side: 1 }),
	// Mid flip with two minutes left: the countdown state
	inProgress          : entryFlip({ won: false, turn: 'mine', side: 2, deadline: '2026-11-07T16:42:00Z' }),
};

// The Lakeside coach's card with the school's open flips set, and its other tasks cleared so only the flip shows
const coachFlips = (flips: { open: number; deadline: string | null }): HomeTourn => {
	const coach = fx.tourn('running', ['coach']);
	return {
		...coach,
		LiveDocs: [],
		Schools: coach.Schools.map(school => school.access === 'full'
			? { ...school, Flips: flips, StrikeCards: [], Signups: [], Fines: [] }
			: school),
	};
};

export const coach = {
	none     : coachFlips({ open: 0, deadline: null }),
	one      : coachFlips({ open: 1, deadline: '2026-11-07T16:50:00Z' }),
	several  : coachFlips({ open: 4, deadline: '2026-11-07T16:43:00Z' }),
};

// The judge's LD round 3 ballot at a step of the flip, with the judge's other tasks cleared so
// only the flip shows. Sides stay hidden until it's done
const judgeFlip = (flipStatus: CurrentBallot['flipStatus']): HomeTourn => {
	const judge = fx.tourn('running', ['judge']);
	const pending = flipStatus !== null && flipStatus !== 'done';
	const ballot: CurrentBallot = {
		...fx.ballots.ldRound3,
		flipStatus,
		Entries: fx.ballots.ldRound3.Entries.map(row => pending ? { ...row, side: null } : row),
	};
	return {
		...judge,
		LiveDocs: [],
		Judges: judge.Judges.map(row => ({ ...row, CurrentBallots: [ballot], Quizzes: [], Strikes: [], Fines: [], Jpools: [] })),
	};
};

export const judge = {
	winnerChoosing : judgeFlip('winner'),
	loserChoosing  : judgeFlip('loser'),
	eitherChoosing : judgeFlip('anyone'),
	done           : judgeFlip('done'),
	noFlip         : judgeFlip(null),
};
