import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/public', () => ({ CLASSIC_URL: 'https://classic.example.com', HOME_FEATURES: 'all' }));

import type { CurrentBallot, HomeRound } from '@tabroom/types';
import * as fx from '../../../storybook/stories/routes/user/home/fixtures';
import { homeFeatureNames, setHomeFeatures, type HomeFeature } from './features';
import { dueText, feedbackItems, homeTasks, openBallots, phaseOf, quizState } from './tasks';

const titles = (tourn: Parameters<typeof homeTasks>[0], now = fx.now) => homeTasks(tourn, now).map(task => task.title);
const toneOf = (tourn: Parameters<typeof homeTasks>[0], title: string, now = fx.now) => homeTasks(tourn, now).find(task => task.title.startsWith(title))?.tone;

beforeEach(() => setHomeFeatures('all'));

describe('phaseOf', () => {
	it('splits on start and end', () => {
		expect(phaseOf(fx.bluebonnetCoachJudge, fx.now)).toBe('running');
		expect(phaseOf(fx.gulfCoastCoachJudge, fx.now)).toBe('upcoming');
		expect(phaseOf(fx.cypressCoachJudge, fx.now)).toBe('past');
	});
});

describe('quizState', () => {
	const [pledge, survey, learn] = fx.bluebonnetCoachJudge.Judges[0]!.Quizzes;

	it('reads completion and NSDA Learn approval', () => {
		expect(quizState(pledge!)).toBe('done');
		expect(quizState(survey!)).toBe('todo');
		expect(quizState(learn!)).toBe('unapproved');
	});

	it('counts an approved NSDA Learn quiz as done', () => {
		expect(quizState({ ...learn!, PersonQuiz: { completed: 1, approved_by: 12, pending: 0 } })).toBe('done');
	});
});

describe('dueText', () => {
	const tz = 'America/Chicago';

	it('shows only the time for a deadline today', () => {
		expect(dueText('2026-11-07T18:30:00Z', tz, fx.now)).toBe('12:30 PM');
	});

	it('carries the date for another day', () => {
		expect(dueText('2026-11-19T02:00:00Z', tz, fx.now)).toBe('Wed, Nov 18 at 8:00 PM');
	});
});

describe('feedbackItems', () => {
	it('links each audited ballot to its ballot page to edit feedback', () => {
		expect(feedbackItems([fx.ballots.ldRound3, fx.ballots.ldRound2Audited])).toEqual([{
			label  : 'Round 2 LD',
			detail : 'Plano East RS vs. Reagan MO',
			action : { label: 'Edit feedback', href: '/user/judge/ballot?judgeId=4410&panelId=90211' },
		}]);
	});
});

describe('openBallots', () => {
	it('leaves out audited ballots', () => {
		expect(openBallots([fx.ballots.ldRound3, fx.ballots.ldRound2Audited])).toEqual([fx.ballots.ldRound3]);
	});

	it('keeps a congress or mock trial chair presiding until the round ends, then moves it to feedback', () => {
		const sessions = [fx.ballots.congressChairSession, fx.ballots.mockTrialChairSession];
		const over = '2026-11-07T18:30:00Z';

		expect(openBallots(sessions, fx.now)).toEqual(sessions);
		expect(feedbackItems(sessions, fx.now)).toEqual([]);
		expect(openBallots(sessions, over)).toEqual([]);
		expect(feedbackItems(sessions, over).map(item => item.label)).toEqual(['Session 2 CON', 'Round 1 MT']);
	});

	it('sends Legion feedback to its classic comments page', () => {
		expect(feedbackItems([fx.ballots.legionRound2Audited], fx.now)[0]!.action!.href)
			.toBe('https://classic.example.com/user/judge/legion_comments.mhtml?panel_id=90381&judge_id=4410');
	});
});

describe('standby and training rows', () => {
	const judge = fx.bluebonnetStandbyTraining.Judges[0]!;

	it('tells a standby judge when and where to stay ready, with no button', () => {
		expect(homeTasks(fx.bluebonnetStandbyTraining, fx.now).find(task => task.title.startsWith('On standby'))).toEqual({
			tone  : 'due',
			title : 'On standby for Round 4',
			when  : '1:00 PM to 3:00 PM',
			lines : [
				'LD Standby R4 · Lakeside High',
				"You have no round, but you may be called in if a judge doesn't show. Stay ready.",
				'Wait in the judge lounge, room 112.',
			],
		});
	});

	it('asks an untrained judge to judge the sample round on classic', () => {
		expect(homeTasks(fx.bluebonnetStandbyTraining, fx.now).find(task => task.title.startsWith('Complete a training ballot'))).toMatchObject({
			tone   : 'due',
			title  : 'Complete a training ballot',
			action : { label: 'Start training', href: `https://classic.example.com/user/judge/training.mhtml?sample=1&event_id=5101&judge_id=${judge.id}` },
		});
	});

	it('names the category for training when the person judges in two', () => {
		const twoRows = { ...fx.bluebonnetStandbyTraining, Judges: [judge, { ...judge, id: 4411, Standbys: [], Training: null }] };
		expect(titles(twoRows)).toContain(`Complete a training ballot for ${judge.Category.abbr}`);
	});
});

describe('ballot rows', () => {
	const row = (ballot: CurrentBallot, now = fx.now, personTz: string | null = null) => homeTasks(
		{ ...fx.bluebonnetCoachJudge, Schools: [], Judges: [{ ...fx.bluebonnetCoachJudge.Judges[0]!, Quizzes: [], CurrentBallots: [ballot] }] },
		now,
		personTz,
	)[0]!;

	it('puts the flight in the round label and lists the room with its notes, entries with sides, and the event instructions', () => {
		expect(row(fx.ballots.ldRound3Flight2)).toMatchObject({
			title  : 'Round 3 Flt 2 LD starts at 11:00 AM',
			lines  : ['Room 214 (Back of the gym, use the side door)', 'Aff Westlake MR vs. Neg Cedar Park TJ', 'Submit your RFD before the next round.'],
			action : { label: 'Start round' },
		});
	});

	it('lists speech entries in speaking order', () => {
		expect(row(fx.ballots.oiRound2).lines).toEqual(['Room 214', '1. Bush RS · 2. Lee KM · 3. Tran AB']);
	});

	it('gives a presiding chair an info row back to the session, without entries for congress', () => {
		expect(row(fx.ballots.congressChairSession)).toMatchObject({
			tone   : 'info',
			title  : 'Session 2 CON: presiding until 12:00 PM',
			lines  : ['Room 214'],
			action : { label: 'Session info' },
		});
		expect(row(fx.ballots.mockTrialChairSession)).toMatchObject({
			tone   : 'info',
			title  : 'Round 1 MT: presiding until 12:00 PM',
			lines  : ['Room 214 · Presiding judge', 'Prosecution Lakeside A vs. Defense Westlake B'],
			action : { label: 'Start round' },
		});
	});

	it('gives a WUDC panelist and a paper ballot no button, and never makes them critical', () => {
		const late = '2026-11-07T19:30:00Z';
		expect(row(fx.ballots.wudcPanelist, late)).toMatchObject({
			tone  : 'due',
			lines : ['Room 214 · Panelist: only chairs enter ballots', '1G Lakeside AB · 1O Westlake CD · 2G Reagan EF · 2O Plano GH'],
		});
		expect(row(fx.ballots.wudcPanelist).action).toBeUndefined();
		expect(row(fx.ballots.ldRound3Paper, late)).toMatchObject({ tone: 'due', lines: ['Room 214', 'Aff Westlake MR vs. Neg Cedar Park TJ'] });
		expect(row(fx.ballots.ldRound3Paper).action).toBeUndefined();
	});

	it('gives an async round its judging deadline instead of a start time', () => {
		expect(row(fx.ballots.ldRound3Async)).toMatchObject({ title: 'Round 3 LD ballot due 1:00 PM', lines: ['Video links are on the ballot', 'Aff Westlake MR vs. Neg Cedar Park TJ'] });
	});

	it("adds the judge's own time to an online round in another time zone", () => {
		expect(row(fx.ballots.ldRound3Online, fx.now, 'America/New_York').title).toBe('Round 3 LD starts at 11:00 AM CST (12:00 PM EST your time)');
		expect(row(fx.ballots.ldRound3Online, fx.now, 'America/Chicago').title).toBe('Round 3 LD starts at 11:00 AM');
		expect(row(fx.ballots.ldRound3, fx.now, 'America/New_York').title).toBe('Round 3 LD starts at 11:00 AM');
	});
});

describe('homeTasks', () => {
	it('puts questionnaires late at a running tournament first, then the ballot and strike cards, never the audited ballot', () => {
		const tasks = homeTasks(fx.bluebonnetCoachJudge, fx.now);
		expect(tasks.map(task => task.title)).toEqual([
			'1 of 3 questionnaires completed',
			'Round 3 LD starts at 11:00 AM',
			'2 strike cards open',
		]);
		expect(tasks[0]).toMatchObject({ detail: '1 to complete, 1 waiting for NSDA Learn approval.' });
		expect(tasks[1]).toMatchObject({ lines: ['Room 214', 'Aff Westlake MR vs. Neg Cedar Park TJ'], room: undefined });
		expect(tasks[2]).toMatchObject({ when: 'Due 12:30 PM' });
		expect(tasks[2]!.items).toHaveLength(2);
	});

	it('gives an online ballot its room to join', () => {
		expect(homeTasks(fx.bluebonnetOnlineCoachJudge, fx.now).find(task => task.room)!.room).toEqual({
			room   : fx.ballots.ldRound3Online.Room,
			target : { type: 'section', tournId: 31201, sectionId: 90311 },
		});
	});

	it('drops strike cards once they are due', () => {
		expect(titles(fx.bluebonnetCoachJudge, '2026-11-07T19:00:00Z')).not.toContain('2 strike cards open');
	});

	it('names each category when the person has two judge rows', () => {
		expect(titles(fx.bluebonnetTwoJudgeRows)).toContain('1 of 3 questionnaires completed for LD');
	});

	it('asks the flip winner to choose until the flip is due', () => {
		expect(titles(fx.bluebonnetCompetitor)).toEqual(['Flip for round 3']);
		expect(titles(fx.bluebonnetCompetitor, '2026-11-07T16:55:00Z')).toEqual([]);
	});

	describe('flip turns', () => {
		// the competitor's round 3 flip at another point in the flip
		const withFlip = (change: Partial<NonNullable<HomeRound['Panel']['Flip']>>) => ({
			...fx.bluebonnetCompetitor,
			Entries: fx.bluebonnetCompetitor.Entries.map(entry => ({
				...entry,
				Rounds: entry.Rounds.map(round => round.Panel.Flip ? { ...round, Panel: { ...round.Panel, Flip: { ...round.Panel.Flip, ...change } } } : round),
			})),
		});
		const flipDetail = (tourn: Parameters<typeof homeTasks>[0]) => homeTasks(tourn, fx.now).find(task => task.title.startsWith('Flip'))?.detail;

		it('tells only the toss winner it won', () => {
			expect(flipDetail(fx.bluebonnetCompetitor)).toBe('You won the flip. Choose a side or speaking order.');
			expect(flipDetail(withFlip({ won: false, turn: 'mine' }))).toBe("It's your turn to choose a side or speaking order.");
		});

		it('offers side only without team order', () => {
			expect(flipDetail(withFlip({ teamOrder: false }))).toBe('You won the flip. Choose a side.');
		});

		it('lets either side choose in the anyone window', () => {
			expect(flipDetail(withFlip({ turn: 'either' }))).toBe('Either side may choose first.');
		});

		it("asks nothing while it's the other entry's turn", () => {
			expect(titles(withFlip({ won: true, turn: 'theirs' }))).toEqual([]);
		});
	});

	it('lists what a coach and judge owes before the tournament', () => {
		expect(titles(fx.gulfCoastCoachJudge)).toEqual([
			'0 of 3 questionnaires completed',
			'Judge prefs are open for PF',
			'2 student signups to approve',
			'Registration closes Fri, Nov 13 at 5:00 PM',
		]);
	});

	it('shows the open pref window to the entry and to a prefs-only coach', () => {
		expect(titles(fx.gulfCoastCompetitor)).toEqual(['Judge prefs are open for PF']);
		expect(titles(fx.gulfCoastPrefsOnly)).toEqual(['Judge prefs are open for PF', 'Judge prefs are open for LD']);
	});

	it('asks for school check-in only while the window is open', () => {
		expect(titles(fx.gulfCoastCoachJudge, '2026-11-20T13:00:00Z')).toContain('Check in your school');
		expect(titles(fx.gulfCoastCoachJudge, '2026-11-20T16:00:00Z')).not.toContain('Check in your school');
	});


	it('gives tab staff no tasks', () => {
		expect(titles(fx.tourn('past', ['tab']))).toEqual([]);
		expect(titles(fx.tourn('running', ['tab']))).toEqual([]);
	});

	it('owes nothing at a finished tournament', () => {
		expect(titles(fx.cypressCoachJudge)).toEqual([]);
		expect(titles(fx.cypressCompetitor)).toEqual([]);
	});
});

describe('feature flags', () => {
	// each flag, a tourn whose tasks include its row, and how that row's title starts
	const rows: [HomeFeature, Parameters<typeof homeTasks>[0], string, string][] = [
		['standby', fx.bluebonnetStandbyTraining, fx.now, 'On standby'],
		['training', fx.bluebonnetStandbyTraining, fx.now, 'Complete a training ballot'],
		['questionnaires', fx.bluebonnetCoachJudge, fx.now, '1 of 3 questionnaires'],
		['flips', fx.bluebonnetCompetitor, fx.now, 'Flip for round 3'],
		['prefs', fx.gulfCoastCoachJudge, fx.now, 'Judge prefs are open'],
		['signups', fx.gulfCoastCoachJudge, fx.now, '2 student signups'],
		['strikeCards', fx.bluebonnetCoachJudge, fx.now, '2 strike cards open'],
		['onsite', fx.gulfCoastCoachJudge, '2026-11-20T13:00:00Z', 'Check in your school'],
		['registration', fx.gulfCoastCoachJudge, fx.now, 'Registration closes'],
	];

	it.each(rows)('%s off drops its row and nothing else', (flag, tourn, now, title) => {
		const all = titles(tourn, now);
		expect(all.some(task => task.startsWith(title))).toBe(true);
		setHomeFeatures(homeFeatureNames.filter(name => name !== flag));
		expect(titles(tourn, now)).toEqual(all.filter(task => !task.startsWith(title)));
	});

	it('prefs covers the entry and the prefs-only coach too', () => {
		setHomeFeatures([]);
		expect(titles(fx.gulfCoastCompetitor)).toEqual([]);
		expect(titles(fx.gulfCoastPrefsOnly)).toEqual([]);
	});

	it('owes only its ballots with every flag off', () => {
		setHomeFeatures([]);
		expect(titles(fx.bluebonnetCoachJudge)).toEqual(['Round 3 LD starts at 11:00 AM']);
		expect(titles(fx.gulfCoastCoachJudge)).toEqual([]);
	});
});

describe('task levels', () => {
	const startedBallot = {
		...fx.bluebonnetCoachJudge,
		Judges: fx.bluebonnetCoachJudge.Judges.map(judge => ({ ...judge, CurrentBallots: [{ ...fx.ballots.ldRound3, status: 'started' as const }] })),
	};

	const noEntries = {
		...fx.gulfCoastCoachJudge,
		Schools: fx.gulfCoastCoachJudge.Schools.map(school => school.access === 'full' ? { ...school, Counts: { ...school.Counts, entries: 0 } } : school),
	};

	it('makes an unstarted ballot critical once its round starts', () => {
		expect(toneOf(fx.bluebonnetCoachJudge, 'Round 3 LD')).toBe('due');
		expect(toneOf(fx.bluebonnetCoachJudge, 'Round 3 LD', '2026-11-07T17:05:00Z')).toBe('critical');
	});

	it('keeps a started ballot due until its deadline, then critical', () => {
		expect(toneOf(startedBallot, 'Round 3 LD', '2026-11-07T18:00:00Z')).toBe('due');
		expect(toneOf(startedBallot, 'Round 3 LD', '2026-11-07T19:05:00Z')).toBe('critical');
	});

	it('makes questionnaires due before the tournament and alert once it starts', () => {
		expect(toneOf(fx.gulfCoastCoachJudge, '0 of 3 questionnaires')).toBe('due');
		expect(toneOf(fx.bluebonnetCoachJudge, '1 of 3 questionnaires')).toBe('alert');
	});

	it('keeps flips due', () => {
		expect(toneOf(fx.bluebonnetCompetitor, 'Flip for round 3')).toBe('due');
	});

	it('makes school check-in an alert', () => {
		expect(toneOf(fx.gulfCoastCoachJudge, 'Check in your school', '2026-11-20T13:00:00Z')).toBe('alert');
	});

	it('makes registration info once the school has entries, due before', () => {
		expect(toneOf(fx.gulfCoastCoachJudge, 'Registration closes')).toBe('info');
		expect(toneOf(noEntries, 'Registration closes')).toBe('due');
	});
});
