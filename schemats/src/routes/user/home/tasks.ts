/*
 * What a home card owes the person, derived from one HomeTourn. Pure, so the
 * card components only lay it out and the rules are unit-tested here.
 */
import type { CurrentBallot, HomeJudge, HomeTourn, OnlineRoom } from '@tabroom/types';
import { CLASSIC_URL } from '$app/env/public';
import { parseDateTime, showDateTime, showTime } from '$lib/helpers/dt';

export type Phase = 'running' | 'upcoming' | 'past';

// now: do it now. due: has a deadline. info: nothing owed. problem: blocked.
export type Tone = 'info' | 'due' | 'alert' | 'critical';

type Link = { label: string, href: string };

/* One line in a grouped list: a strike card for one round, or one questionnaire */
export type TaskItem = {
	label   : string,
	detail? : string,
	when?   : string,
	status? : { text: string, tone: 'success' | 'warning' | 'danger' | 'muted' },
	action? : Link,
};

/*
 * One row in a card's action area. Several things of the same kind are one
 * task with `items`, so ten strike cards still take one row.
 */
export type Task = {
	title       : string,
	when?       : string,
	detail?     : string,
	action?     : Link,
	tone        : Tone,
	// The round's online room, joined beside the action; the target matches OnlineRoom.svelte's section target
	room?       : { room: OnlineRoom, target: { type: 'section', tournId: number, sectionId: number } },
	items?      : TaskItem[],
	itemsLabel? : string, // what the list holds, for the disclosure: "strike cards", "questionnaires"
};

// Classic has no per-entry results page and flip and strike cards are person-scoped, so those take no ids
export const classic = {
	quiz           : (quiz: number) => `${CLASSIC_URL}/user/judge/quiz_take.mhtml?quiz_id=${quiz}`,
	conflicts      : (judge: number) => `${CLASSIC_URL}/user/judge/judge_conflicts.mhtml?judge_id=${judge}`,
	flip           : () => `${CLASSIC_URL}/user/enter/flip.mhtml`,
	entryPrefs     : (entry: number, school: number | null, type: string | null) =>
		`${CLASSIC_URL}/user/enter/ratings/${type ?? 'ordinals'}_prefs.mhtml?entry_id=${entry}&school_id=${school ?? ''}`,
	tournResults   : (tourn: number) => `${CLASSIC_URL}/index/tourn/main.mhtml?tourn_id=${tourn}`,
	entries        : (school: number) => `${CLASSIC_URL}/user/enter/entry.mhtml?school_id=${school}`,
	dashboard      : (school: number) => `${CLASSIC_URL}/user/enter/dashboard.mhtml?school_id=${school}`,
	strikeCards    : () => `${CLASSIC_URL}/user/enter/strike_cards.mhtml`,
	signups        : (school: number) => `${CLASSIC_URL}/user/enter/signup.mhtml?school_id=${school}`,
	onsite         : (school: number) => `${CLASSIC_URL}/user/enter/onsite.mhtml?school_id=${school}`,
	schoolPrefs    : (school: number) => `${CLASSIC_URL}/user/enter/ratings/index.mhtml?school_id=${school}`,
	schoolResults  : (school: number) => `${CLASSIC_URL}/user/results/report.mhtml?school_id=${school}`,
	tabRoom        : (tourn: number) => `${CLASSIC_URL}/user/tourn/select.mhtml?tourn_id=${tourn}`,
	paradigmReview : () => `${CLASSIC_URL}/user/judge/paradigm_approve.mhtml`,
	paradigm       : () => `${CLASSIC_URL}/user/judge/paradigm.mhtml`,
	confirmEmail   : () => `${CLASSIC_URL}/user/login/confirm.mhtml`,
};

// Time rules read the browser clock; ballots don't, since the server decides which are current.
// `now` is a parameter so tests can pin it.
export function phaseOf(tourn: Pick<HomeTourn, 'start' | 'end'>, now = new Date().toISOString()): Phase {
	if (now < tourn.start) return 'upcoming';
	return now > tourn.end ? 'past' : 'running';
}

type HomeQuiz = HomeJudge['Quizzes'][number];

type QuizState = 'done' | 'unapproved' | 'todo';

// unapproved: completed, but NSDA Learn has not approved it yet
export function quizState(quiz: HomeQuiz): QuizState {
	if (!quiz.PersonQuiz?.completed) return 'todo';
	return quiz.Quiz.approval && !quiz.PersonQuiz.approved_by ? 'unapproved' : 'done';
}

const quizOrder: Record<QuizState, number> = { todo: 0, unapproved: 1, done: 2 };

const quizStatus = {
	todo       : { text: 'Not completed', tone: 'danger' },
	unapproved : { text: 'Waiting for NSDA Learn approval', tone: 'warning' },
	done       : { text: 'Completed', tone: 'success' },
} as const;

// Every questionnaire as a list row, still-to-do first, each linking to its page
export const quizItems = (quizzes: HomeQuiz[]): TaskItem[] => [...quizzes]
	.sort((a, b) => quizOrder[quizState(a)] - quizOrder[quizState(b)])
	.map(quiz => ({
		label  : quiz.Quiz.label ?? 'Questionnaire',
		detail : quiz.requiredBy,
		status : quizStatus[quizState(quiz)],
		action : { label: quizState(quiz) === 'todo' ? 'Complete' : 'View', href: classic.quiz(quiz.Quiz.id) },
	}));

// A deadline today reads as a time; any other day carries its date
export function dueText(iso: string, tz: string, now = new Date().toISOString()): string {
	const sameDay = parseDateTime({ dtISO: iso, tz }).hasSame(parseDateTime({ dtISO: now, tz }), 'day');
	return sameDay ? showTime({ dtISO: iso, tz }) : showDateTime({ dtISO: iso, tz, format: 'medium', joinWord: 'at' });
}

export const roundLabel = (round: { label: string | null, name: number | null }) => round.label ?? `Round ${round.name ?? ''}`.trim();

const isOpen = (window: { start: string | null, end: string | null }, now: string) =>
	(!window.start || window.start <= now) && (!!window.end && now < window.end);

const toneRank: Record<Tone, number> = { critical: 0, alert: 1, due: 2, info: 3 };

const ballotHref = (ballot: CurrentBallot): string => ballot.legion
	? `${CLASSIC_URL}/user/judge/legion_ballot.mhtml?panel_id=${ballot.id}&judge_id=${ballot.JudgeId}`
	: `/user/judge/ballot?judgeId=${ballot.JudgeId}&panelId=${ballot.id}`;

const matchup = (ballot: CurrentBallot) => ballot.eventType === 'debate' ? ballot.Entries.map(entry => entry.code).join(' vs. ') : '';

// Audited ballots are done, so they never ask for action; until feedback closes they stay editable for comments and RFDs
export const openBallots = (ballots: CurrentBallot[]) => ballots.filter(ballot => !ballot.audited);

export const feedbackItems = (ballots: CurrentBallot[]): TaskItem[] => ballots
	.filter(ballot => ballot.audited)
	.map(ballot => ({
		label  : `${roundLabel(ballot)} ${ballot.eventAbbr ?? ''}`.trim(),
		detail : matchup(ballot) || undefined,
		action : { label: 'Edit feedback', href: ballotHref(ballot) },
	}));

// An unstarted ballot is late once the round starts; a started one once its decision deadline passes
function ballotTask(ballot: CurrentBallot, tz: string, now: string): Task {
	const label = ballot.status === 'scored' ? 'Confirm result'
		: ballot.status === 'started' ? 'Enter ballot'
		: ballot.startText ?? 'Start round';
	return {
		tone   : now < (ballot.status === 'not_started' ? ballot.start : ballot.deadline) ? 'due' : 'critical',
		title  : `${roundLabel(ballot)} ${ballot.eventAbbr ?? ''} starts at ${showTime({ dtISO: ballot.start, tz })}`.replace(/\s+/g, ' '),
		detail : [ballot.Room?.name, matchup(ballot)].filter(Boolean).map(part => `${part}.`).join(' '),
		action : { label, href: ballotHref(ballot) },
		room   : ballot.Room?.joinable ? { room: ballot.Room, target: { type: 'section', tournId: ballot.tourn, sectionId: ballot.id } } : undefined,
	};
}

function quizTask(judge: HomeJudge, phase: Phase, many: boolean): Task | null {
	const states = judge.Quizzes.map(quizState);
	const todo = states.filter(state => state === 'todo').length;
	const waiting = states.filter(state => state === 'unapproved').length;
	if (todo + waiting === 0) return null;
	return {
		tone       : phase === 'upcoming' ? 'due' : 'alert',
		title      : `${states.length - todo - waiting} of ${states.length} questionnaires completed${many ? ` for ${judge.Category.abbr ?? judge.Category.name}` : ''}`,
		when       : phase === 'upcoming' ? 'Before the tournament starts' : undefined,
		detail     : `${[todo > 0 ? `${todo} to complete` : '', waiting > 0 ? `${waiting} waiting for NSDA Learn approval` : ''].filter(Boolean).join(', ')}.`,
		items      : quizItems(judge.Quizzes),
		itemsLabel : 'questionnaires',
	};
}

/* Everything the person owes at the tourn, across their roles, most urgent first */
export function homeTasks(tourn: HomeTourn, now = new Date().toISOString()): Task[] {
	const phase = phaseOf(tourn, now);
	const due = (iso: string) => `Due ${dueText(iso, tourn.tz, now)}`;
	const tasks: Task[] = [];

	for (const judge of tourn.Judges) {
		tasks.push(...openBallots(judge.CurrentBallots).map(ballot => ballotTask(ballot, tourn.tz, now)));
		const quiz = phase === 'past' ? null : quizTask(judge, phase, tourn.Judges.length > 1);
		if (quiz) tasks.push(quiz);
	}

	for (const entry of tourn.Entries) {
		for (const round of entry.Rounds) {
			const { flip_at: flipAt, flip_status: flipStatus } = round.Panel;
			if (!flipAt || flipAt < now || (flipStatus !== 'winner' && flipStatus !== 'anyone')) continue;
			tasks.push({
				tone   : 'due',
				title  : `Flip for ${roundLabel(round).toLowerCase()}`,
				when   : due(flipAt),
				detail : flipStatus === 'winner' ? 'You won the flip. Choose a side or speaking order.' : 'Either side may choose first.',
				action : { label: 'Choose side', href: classic.flip() },
			});
		}
		if (entry.Prefs?.end && isOpen(entry.Prefs, now)) {
			tasks.push({
				tone   : 'due',
				title  : `Judge prefs are open for ${entry.Event.abbr ?? entry.code}`,
				when   : due(entry.Prefs.end),
				action : { label: 'Fill in pref sheet', href: classic.entryPrefs(entry.id, entry.school, entry.Prefs.type) },
			});
		}
	}

	for (const school of tourn.Schools) {
		for (const sheet of school.Prefs.filter(sheet => isOpen(sheet, now))) {
			tasks.push({
				tone   : 'due',
				title  : `Judge prefs are open for ${sheet.Category.abbr ?? sheet.Category.name}`,
				when   : sheet.end ? due(sheet.end) : undefined,
				detail : `${sheet.entries} ${sheet.entries === 1 ? 'entry' : 'entries'} to pref for.`,
				action : { label: 'Fill in pref sheets', href: classic.schoolPrefs(school.id) },
			});
		}
		if (school.access !== 'full') continue;

		if (school.Signups.length > 0) {
			const names = school.Signups.map(signup => `${signup.Student.first ?? ''} ${signup.Student.last ?? ''} in ${signup.Event.abbr ?? 'an event'}`.trim());
			tasks.push({
				tone   : 'due',
				title  : `${school.Signups.length} student ${school.Signups.length === 1 ? 'signup' : 'signups'} to approve`,
				detail : `${names.join(' and ')}.`,
				action : { label: 'Review signups', href: classic.signups(school.id) },
			});
		}

		const cards = school.StrikeCards.filter(card => !card.due || card.due > now);
		if (cards.length > 0) {
			const first = cards.map(card => card.due).filter(Boolean).sort()[0];
			tasks.push({
				tone       : 'due',
				title      : cards.length === 1 ? `Strike card for ${roundLabel(cards[0].Round)}` : `${cards.length} strike cards open`,
				when       : first ? due(first) : undefined,
				action     : { label: 'Enter strikes', href: classic.strikeCards() },
				items      : cards.length > 1 ? cards.map(card => ({ label: roundLabel(card.Round), when: card.due ? due(card.due) : undefined })) : undefined,
				itemsLabel : 'strike cards',
			});
		}

		if (school.Onsite?.end && !school.onsite && isOpen(school.Onsite, now)) {
			tasks.push({
				tone   : 'alert',
				title  : tourn.Schools.length > 1 ? `Check in ${school.name}` : 'Check in your school',
				when   : due(school.Onsite.end),
				detail : 'Online check-in tells the tournament your school has arrived. It may ask you to pay fees or name an adult contact first.',
				action : { label: 'Check in', href: classic.onsite(school.id) },
			});
		}

		if (phase === 'upcoming' && isOpen({ start: tourn.reg_start, end: tourn.reg_end }, now)) {
			// A school with no entries yet still owes registration; one with entries just has the option to change them
			tasks.push({
				tone   : school.Counts.entries > 0 ? 'info' : 'due',
				title  : `Registration closes ${dueText(tourn.reg_end, tourn.tz, now)}`,
				detail : `${school.Counts.entries} entries and ${school.Counts.judges} judges so far.`,
				action : { label: 'Edit entries', href: classic.entries(school.id) },
			});
		}
	}

	return tasks.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
}
