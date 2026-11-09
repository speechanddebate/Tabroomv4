/*
 * What a home card owes the person, derived from one HomeTourn. Pure, so the
 * card components only lay it out and the rules are unit-tested here.
 */
import type { CurrentBallot, HomeJudge, HomeTourn, RoomView } from '@tabroom/types';
import { CLASSIC_URL } from '$app/env/public';
import { parseDateTime, showDateTime, showTime } from '$lib/helpers/dt';
import { isEnabled } from './features';

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
	lines?      : string[], // details that each take their own line under the title, e.g. a round's room and entries
	action?     : Link,
	tone        : Tone,
	// The round's online room, joined beside the action; the target matches OnlineRoom.svelte's section target
	room?       : { room: RoomView, target: { type: 'section', tournId: number, sectionId: number } },
	items?      : TaskItem[],
	itemsLabel? : string, // what the list holds, for the disclosure: "strike cards", "questionnaires"
};

// Classic has no per-entry results page and flip and strike cards are person-scoped, so those take no ids
export const classic = {
	quiz           : (quiz: number) => `${CLASSIC_URL}/user/judge/quiz_take.mhtml?quiz_id=${quiz}`,
	training       : (event: number, judge: number) => `${CLASSIC_URL}/user/judge/training.mhtml?sample=1&event_id=${event}&judge_id=${judge}`,
	legionComments : (panel: number, judge: number) => `${CLASSIC_URL}/user/judge/legion_comments.mhtml?panel_id=${panel}&judge_id=${judge}`,
	conflicts      : (judge: number) => `${CLASSIC_URL}/user/judge/judge_conflicts.mhtml?judge_id=${judge}`,
	standingConflicts: () => `${CLASSIC_URL}/user/judge/conflicts.mhtml`,
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

/**
 * Where the card's "Add conflicts" goes: the beta sheet once it's on, else classic's. A category
 * that doesn't take judge conflicts still gets the link, to the account-wide list.
 */
export function conflictsHref(judge: Pick<HomeJudge, 'id' | 'tournConflicts'>): string {
	if (!judge.tournConflicts) return classic.standingConflicts();
	return isEnabled('conflictSheet') ? `/user/judge/conflicts?judge=${judge.id}` : classic.conflicts(judge.id);
}

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

// "Round 3 Flt 2 LD": the flight rides with the round, as on classic's panel card
const ballotRound = (ballot: CurrentBallot) => [
	ballot.eventType === 'congress' && !ballot.label ? `Session ${ballot.name ?? ''}` : roundLabel(ballot),
	ballot.flight ? `Flt ${ballot.flight}` : '',
	ballot.eventAbbr ?? '',
].filter(Boolean).join(' ');

// A congress or mock trial chair keeps presiding after their ballot is audited, until the round ends
export const presiding = (ballot: CurrentBallot, now = new Date().toISOString()) => ballot.status === 'confirmed'
	&& ballot.chair
	&& (ballot.eventType === 'congress' || ballot.eventType === 'mock_trial')
	&& now < ballot.end;

// Audited ballots are done, so they never ask for action, except a session the judge is still
// presiding over; until feedback closes the rest stay editable for comments and RFDs
export const openBallots = (ballots: CurrentBallot[], now = new Date().toISOString()) => ballots
	.filter(ballot => ballot.status !== 'confirmed' || presiding(ballot, now));

export const feedbackItems = (ballots: CurrentBallot[], now = new Date().toISOString()): TaskItem[] => ballots
	.filter(ballot => ballot.status === 'confirmed' && !presiding(ballot, now))
	.map(ballot => ({
		label  : ballotRound(ballot),
		detail : matchup(ballot) || undefined,
		action : { label: 'Edit feedback', href: ballot.legion ? classic.legionComments(ballot.id, ballot.JudgeId) : ballotHref(ballot) },
	}));

// The entries as classic's panel card lists them: sides or positions for two-sided events and
// WUDC, speaking order for speech, none for congress and Legion
function entriesLine(ballot: CurrentBallot): string | undefined {
	if (ballot.eventType === 'congress' || ballot.legion || ballot.Entries.length === 0) return undefined;
	if (ballot.eventType === 'speech') {
		return [...ballot.Entries]
			.sort((a, b) => (a.speakerOrder ?? 0) - (b.speakerOrder ?? 0))
			.map(entry => entry.speakerOrder ? `${entry.speakerOrder}. ${entry.code ?? ''}` : entry.code ?? '')
			.join(' · ');
	}
	const entries = ballot.Entries.map(entry => `${entry.side ?? ''} ${entry.code ?? ''}`.trim());
	return entries.join(entries.length === 2 ? ' vs. ' : ' · ');
}

/*
 * One open panel as a task row. An unstarted ballot is late once the round starts and a started
 * one once its decision deadline passes; a paper ballot, a WUDC panelist, and a chair still
 * presiding owe nothing online, so they never turn critical.
 */
function ballotTask(ballot: CurrentBallot, tz: string, personTz: string | null, now: string): Task {
	const isPresiding = presiding(ballot, now);
	const panelist = ballot.eventType === 'wudc' && !ballot.chair;
	const asynchronous = ballot.onlineMode === 'async' || ballot.show_async;
	// Online rounds also give the judge's own time when they're in another zone, like classic
	const online = !!ballot.onlineMode && ballot.onlineMode !== 'none';
	const time = (iso: string) => online && personTz && personTz !== tz
		? `${showTime({ dtISO: iso, tz, showTz: true })} (${showTime({ dtISO: iso, tz: personTz, showTz: true })} your time)`
		: showTime({ dtISO: iso, tz });

	const label = isPresiding ? (ballot.eventType === 'congress' ? 'Session info' : ballot.startText ?? 'Start round')
		: ballot.status === 'scored' ? 'Confirm result'
		: ballot.status === 'started' ? 'Enter ballot'
		: ballot.startText ?? 'Start round';

	const room = ballot.Room?.name ?? '';
	const facts = [
		asynchronous ? 'Video links are on the ballot' : ballot.roomNotes ? `${room} (${ballot.roomNotes})`.trim() : room,
		ballot.eventType === 'mock_trial' ? (ballot.chair ? 'Presiding judge' : 'Scorer') : '',
		panelist ? 'Panelist: only chairs enter ballots' : '',
	].filter(Boolean).join(' · ');

	return {
		tone   : isPresiding ? 'info'
			: !ballot.onlineBallots || panelist ? 'due'
			: now < (ballot.status === 'not_started' ? ballot.start : ballot.deadline) ? 'due' : 'critical',
		title  : isPresiding ? `${ballotRound(ballot)}: presiding until ${time(ballot.end)}`
			: asynchronous ? `${ballotRound(ballot)} ballot due ${time(ballot.end)}`
			: `${ballotRound(ballot)} starts at ${time(ballot.start)}`,
		lines  : [facts, entriesLine(ballot), ballot.ballotText ?? '']
			.filter((line): line is string => !!line),
		action : ballot.onlineBallots && !panelist ? { label, href: ballotHref(ballot) } : undefined,
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
// personTz is the judge's own zone, which online rounds show beside the tournament's
export function homeTasks(tourn: HomeTourn, now = new Date().toISOString(), personTz: string | null = null): Task[] {
	const phase = phaseOf(tourn, now);
	const due = (iso: string) => `Due ${dueText(iso, tourn.tz, now)}`;
	const tasks: Task[] = [];

	for (const judge of tourn.Judges) {
		tasks.push(...openBallots(judge.CurrentBallots, now).map(ballot => ballotTask(ballot, tourn.tz, personTz, now)));

		// The server lists a standby until its timeslot ends; nothing to open, just be ready
		if (isEnabled('standby')) tasks.push(...judge.Standbys.map(standby => ({
			tone  : 'due' as const,
			title : `On standby for ${standby.Timeslot.name}`,
			when  : `${dueText(standby.Timeslot.start, tourn.tz, now)} to ${showTime({ dtISO: standby.Timeslot.end, tz: tourn.tz })}`,
			lines : [
				[standby.name, standby.Site?.name].filter(Boolean).join(' · '),
				"You have no round, but you may be called in if a judge doesn't show. Stay ready.",
				standby.message ?? '',
			].filter(Boolean),
		})));

		if (isEnabled('training') && judge.Training && phase !== 'past') {
			tasks.push({
				tone   : 'due',
				title  : `Complete a training ballot${tourn.Judges.length > 1 ? ` for ${judge.Category.abbr ?? judge.Category.name}` : ''}`,
				detail : 'Judge a sample round to learn how online ballots work.',
				action : { label: 'Start training', href: classic.training(judge.Training.event, judge.id) },
			});
		}
		const quiz = phase === 'past' || !isEnabled('questionnaires') ? null : quizTask(judge, phase, tourn.Judges.length > 1);
		if (quiz) tasks.push(quiz);
	}

	for (const entry of tourn.Entries) {
		for (const round of entry.Rounds) {
			const flip = round.Panel.Flip;
			if (!isEnabled('flips') || !flip || flip.deadline < now || flip.turn === 'theirs') continue;
			const choice = flip.teamOrder ? 'a side or speaking order' : 'a side';
			tasks.push({
				tone   : 'due',
				title  : `Flip for ${roundLabel(round).toLowerCase()}`,
				when   : due(flip.deadline),
				detail : flip.turn === 'either'
					? 'Either side may choose first.'
					: flip.won ? `You won the flip. Choose ${choice}.` : `It's your turn to choose ${choice}.`,
				action : { label: 'Choose side', href: classic.flip() },
			});
		}
		if (isEnabled('prefs') && entry.Prefs?.end && isOpen(entry.Prefs, now)) {
			tasks.push({
				tone   : 'due',
				title  : `Judge prefs are open for ${entry.Event.abbr ?? entry.code}`,
				when   : due(entry.Prefs.end),
				action : { label: 'Fill in pref sheet', href: classic.entryPrefs(entry.id, entry.school, entry.Prefs.type) },
			});
		}
	}

	for (const school of tourn.Schools) {
		for (const sheet of school.Prefs.filter(sheet => isEnabled('prefs') && isOpen(sheet, now))) {
			tasks.push({
				tone   : 'due',
				title  : `Judge prefs are open for ${sheet.Category.abbr ?? sheet.Category.name}`,
				when   : sheet.end ? due(sheet.end) : undefined,
				detail : `${sheet.entries} ${sheet.entries === 1 ? 'entry' : 'entries'} to pref for.`,
				action : { label: 'Fill in pref sheets', href: classic.schoolPrefs(school.id) },
			});
		}
		if (school.access !== 'full') continue;

		if (isEnabled('signups') && school.Signups.length > 0) {
			const names = school.Signups.map(signup => `${signup.Student.first ?? ''} ${signup.Student.last ?? ''} in ${signup.Event.abbr ?? 'an event'}`.trim());
			tasks.push({
				tone   : 'due',
				title  : `${school.Signups.length} student ${school.Signups.length === 1 ? 'signup' : 'signups'} to approve`,
				detail : `${names.join(' and ')}.`,
				action : { label: 'Review signups', href: classic.signups(school.id) },
			});
		}

		const cards = school.StrikeCards.filter(card => !card.due || card.due > now);
		if (isEnabled('strikeCards') && cards.length > 0) {
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

		if (isEnabled('onsite') && school.Onsite?.end && !school.onsite && isOpen(school.Onsite, now)) {
			tasks.push({
				tone   : 'alert',
				title  : tourn.Schools.length > 1 ? `Check in ${school.name}` : 'Check in your school',
				when   : due(school.Onsite.end),
				detail : 'Online check-in tells the tournament your school has arrived. It may ask you to pay fees or name an adult contact first.',
				action : { label: 'Check in', href: classic.onsite(school.id) },
			});
		}

		if (isEnabled('registration') && phase === 'upcoming' && isOpen({ start: tourn.reg_start, end: tourn.reg_end }, now)) {
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
