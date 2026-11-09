<script lang="ts" module>
	/*
	 * A judge's current ballot as a task row, every way it can look, on one page.
	 * Each row comes from homeTasks over a judge-only running tourn carrying just
	 * that ballot, so the rules in tasks.ts decide the tone, title, and button.
	 * Time is frozen at fx.now (16:40Z); the base ballot starts at 17:00Z.
	 */
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { CurrentBallot } from '@tabroom/types';
	import { getRestTournsSectionsRoomJoinMockHandler } from '$indexcards/index.msw';
	import TaskRow from '../../../../../../routes/user/home/TaskRow.svelte';
	import { homeTasks, type Task } from '../../../../../../routes/user/home/tasks';
	import { freezeTime } from '../../../../../utils/freezeTime';
	import * as fx from '../fixtures';

	const { Story } = defineMeta({
		title: 'Routes/User/Home/Tasks/Current ballots',
		parameters: {
			layout: 'padded',
			// Every room join answers with a plain video link, so the buttons work in review
			msw: { handlers: [getRestTournsSectionsRoomJoinMockHandler({ url: 'https://zoom.test/room', token: null, password: null })] },
		},
		beforeEach: () => freezeTime(fx.now),
	});

	const judgeOnly = fx.tourn('running', ['judge']);

	// The ballot's task row alone: the judge fixture's quizzes and pools would add rows of their own
	function row(ballot: CurrentBallot, personTz: string | null = null): Task {
		const tourn = { ...judgeOnly, Judges: judgeOnly.Judges.map(judge => ({ ...judge, Quizzes: [], Standbys: [], Training: null, CurrentBallots: [ballot] })) };
		return homeTasks(tourn, fx.now, personTz)[0];
	}

	type Section = { heading: string; rows: [caption: string, task: Task][] };

	const ld = fx.ballots.ldRound3;
	const late = { start: '2026-11-07T16:00:00Z', deadline: '2026-11-07T16:30:00Z' };

	const debate: Section = {
		heading : 'Debate',
		rows    : [
			['Not started, round ahead', row(ld)],
			['Not started, round has begun', row({ ...ld, ...late })],
			['Started', row({ ...ld, status: 'started' })],
			['Started, past the decision deadline', row({ ...ld, ...late, status: 'started' })],
			['Scored, waiting on confirmation', row({ ...ld, status: 'scored' })],
			['Flight 2 with room notes and event instructions', row(fx.ballots.ldRound3Flight2)],
		],
	};

	const oi = fx.ballots.oiRound2;

	const speech: Section = {
		heading : 'Speech',
		rows    : [
			['Not started', row(oi)],
			['Started', row({ ...oi, status: 'started' })],
			['Ranks in, waiting on confirmation', row({ ...oi, status: 'scored' })],
		],
	};

	const session: CurrentBallot = { ...fx.ballots.congressChairSession, status: 'not_started', start: ld.start, end: ld.end, deadline: ld.deadline };

	const congress: Section = {
		heading : 'Congress presiding officer',
		rows    : [
			['Session not started', row(session)],
			['Session started', row({ ...session, status: 'started' })],
			['Scores in, waiting on confirmation', row({ ...session, status: 'scored' })],
			['Ballot audited, still presiding until the session ends', row(fx.ballots.congressChairSession)],
		],
	};

	// The judge is on Eastern time, so online rounds also show their own time
	const eastern = 'America/New_York';
	const campus = fx.ballots.ldRound3Online;
	const sync: CurrentBallot = { ...ld, onlineMode: 'sync', Room: { name: 'Room 214', joinable: true, hybrid: false, mapUrl: null } };
	const async = fx.ballots.ldRound3Async;

	const online: Section = {
		heading : 'Online rounds',
		rows    : [
			['NSDA Campus', row(campus, eastern)],
			['Sync video room, online ballot', row(sync, eastern)],
			['Sync video room, paper ballot', row({ ...sync, onlineBallots: false }, eastern)],
			['Async, online ballot', row(async, eastern)],
			['Async, paper ballot', row({ ...async, onlineBallots: false }, eastern)],
		],
	};

	const unflipped = ld.Entries.map(entry => ({ ...entry, side: null }));

	const flips: Section = {
		heading : 'Coin flip',
		rows    : [
			['Flip pending: sides hidden', row({ ...ld, flipStatus: 'winner', Entries: unflipped })],
			['Flip done: sides shown', row({ ...ld, flipStatus: 'done' })],
		],
	};

	const sections = [debate, speech, congress, online, flips];
</script>

<Story name="All states">
	{#snippet template()}
		<div class="flex max-w-4xl flex-col gap-6 bg-page p-4">
			{#each sections as section (section.heading)}
				<section>
					<h2 class="mb-2 text-lg font-semibold">{section.heading}</h2>
					<div class="raised overflow-hidden">
						<div class="sunken flex flex-col divide-y divide-border" aria-label={section.heading} role="group">
							{#each section.rows as [caption, task] (caption)}
								<div>
									<div class="px-3 pt-2 text-xs text-muted">{caption}</div>
									<TaskRow {task} />
								</div>
							{/each}
						</div>
					</div>
				</section>
			{/each}
		</div>
	{/snippet}
</Story>
