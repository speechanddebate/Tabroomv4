import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/public', () => ({ CLASSIC_URL: 'https://classic.example.com' }));

import * as fx from '../../../storybook/stories/routes/user/home/fixtures';
import { dueText, feedbackItems, homeTasks, openBallots, phaseOf, quizState } from './tasks';

const titles = (tourn: Parameters<typeof homeTasks>[0], now = fx.now) => homeTasks(tourn, now).map(task => task.title);

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
});

describe('homeTasks', () => {
	it('puts the open ballot first, then questionnaires and strike cards, never the audited ballot', () => {
		const tasks = homeTasks(fx.bluebonnetCoachJudge, fx.now);
		expect(tasks.map(task => task.title)).toEqual([
			'Round 3 LD starts at 11:00 AM',
			'1 of 3 questionnaires completed',
			'2 strike cards open',
		]);
		expect(tasks[0]).toMatchObject({ tone: 'now', detail: 'Room 214. Westlake MR vs. Cedar Park TJ.', room: undefined });
		expect(tasks[1]).toMatchObject({ detail: '1 to complete, 1 waiting for NSDA Learn approval.' });
		expect(tasks[2]).toMatchObject({ when: 'Due 12:30 PM' });
		expect(tasks[2]!.items).toHaveLength(2);
	});

	it('gives an online ballot its room to join', () => {
		expect(homeTasks(fx.bluebonnetOnlineCoachJudge, fx.now)[0]!.room).toEqual({
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


	it('reminds tab staff to publish results after the tournament', () => {
		expect(titles(fx.tourn('past', ['tab']))).toEqual(['Results are not published yet']);
		expect(titles(fx.tourn('running', ['tab']))).toEqual([]);
	});

	it('owes nothing at a finished tournament outside tab', () => {
		expect(titles(fx.cypressCoachJudge)).toEqual([]);
		expect(titles(fx.cypressCompetitor)).toEqual([]);
	});
});
