<script lang="ts">
	import type { CurrentBallot } from '$indexcards/schemas';
	import { resolve } from '$app/paths';
	import { showTime } from '$lib/helpers/dt';
	import { Clock, MapPin, Hourglass } from '@lucide/svelte';
	import OnlineRoom from '$lib/components/OnlineRoom.svelte';

	const { ballot, tournId }: {
		ballot: CurrentBallot,
		tournId: number,
	} = $props();

	const buttonColor = $derived.by(() => {
		switch (ballot.status) {
			case 'not_started':
				return 'bg-success';
			case 'scored':
				return 'bg-danger';
			default:
				return 'bg-primary-strong';
		}
	});

	const roundLabel = $derived.by(() => {
		let label = ballot.label
			|| (ballot.eventType === 'congress' ? `Session ${ballot.name}` : `Round ${ballot.name}`);
		if (ballot.flight) {
			label += ` · Flight ${ballot.flight}`;
		}
		return label;
	});

	const buttonText = $derived.by(() => {
		if (ballot.status === 'scored') return 'Confirm Result';
		if (ballot.chair && ballot.eventType === 'congress' && ballot.audited) return 'Session Info';
		if (ballot.status === 'started') return 'Enter Ballot';
		return ballot.startText ?? 'Start Round';
	});

	const ballotHref = $derived(ballot.legion
		? `https://tabroom.com/user/judge/legion_ballot.mhtml?panel_id=${ballot.id}&judge_id=${ballot.JudgeId}`
		: `${resolve('/user/judge/ballot')}?judgeId=${ballot.JudgeId}&panelId=${ballot.id}`);

	const time = (dtISO: string) => showTime({ dtISO, format: 'short', tz: ballot.TournTz, showTz: true });
	const showEntries = $derived(ballot.eventType !== 'congress' && !ballot.legion);

	// Speech and WUDC list entries in two columns filled top to bottom (1-3 | 4-6), unless the widest
	// entry won't fit in half the width. Debate stays one stack.
	let entriesFit = $state(true);
	const twoColumns = $derived((ballot.eventType === 'speech' || ballot.eventType === 'wudc') && entriesFit);
	const entryRows = $derived(Math.ceil(ballot.Entries.length / 2));

	// _entries is only passed so the attachment re-runs, and re-measures, when the entries change
	function fitEntries(grid: HTMLElement, _entries: CurrentBallot['Entries']) {
		const check = () => {
			const columnWidth = (grid.clientWidth - (parseFloat(getComputedStyle(grid).columnGap) || 0)) / 2;
			// scrollWidth is the untruncated width, so this doesn't depend on the current column count
			const widest = Math.max(0, ...Array.from(grid.children, row => {
				const parts = Array.from(row.children);
				const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
				return parts.reduce((width, part) => width + part.scrollWidth, 0) + gap * (parts.length - 1);
			}));
			entriesFit = widest <= columnWidth;
		};
		// Switching columns resizes the grid, so wait a frame to avoid a ResizeObserver loop
		let frame = 0;
		const observer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(check);
		});
		observer.observe(grid);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	}
</script>

<div class="@container rounded-md border border-border bg-surface p-3">
	<!-- Narrow: info and button share the top row, entries below. Wide: three columns. -->
	<div class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-3 @2xl:grid-cols-[1fr_1fr_auto] @2xl:items-center @2xl:gap-x-6">
		<!-- What and when -->
		<div class="col-start-1 row-start-1 min-w-0">
			<div class="flex items-center gap-2">
				{#if ballot.eventAbbr}
					<span
						class="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-bold text-primary-strong"
						title={ballot.eventName}
					>{ballot.eventAbbr}</span>
				{/if}
				<span class="truncate text-sm text-muted">{ballot.eventName}</span>
			</div>
			<div class="mt-1 text-lg font-semibold">{roundLabel}</div>
			<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
				<span class="flex items-center gap-1">
					<Clock class="text-muted" size="14" />{time(ballot.start)}
				</span>
				<span class="flex items-center gap-1">
					<!-- The join button has its own icon, so the pin is only for a room shown as text -->
					{#if ballot.Room?.joinable}
						<OnlineRoom
							room    = {ballot.Room}
							target  = {{ type: 'section', tournId, sectionId: ballot.id }}
							text    = {ballot.Room.name ?? 'Online room'}
							variant = 'text'
						/>
					{:else}
						<MapPin class="text-muted" size="14" />{ballot.Room?.name ?? 'No room'}
					{/if}
				</span>
				<span class="flex items-center gap-1 text-muted">
					<Hourglass size="14" />Due {time(ballot.deadline)}
				</span>
			</div>
			{#if ballot.roomNotes}
				<div class="mt-1 text-xs italic text-muted">{ballot.roomNotes}</div>
			{/if}
		</div>

		<!-- Who -->
		<div class="col-span-2 row-start-2 min-w-0 border-t border-border pt-3 @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1 @2xl:border-t-0 @2xl:border-l @2xl:pt-0 @2xl:pl-6">
			{#if showEntries}
				{#if ballot.flipStatus && ballot.flipStatus !== 'done'}
					<div class="mb-1 text-xs italic text-muted">Flip for sides not complete</div>
				{/if}
				<div
					style:grid-template-rows={twoColumns ? `repeat(${entryRows}, auto)` : undefined}
					class="grid gap-x-6 gap-y-0.5 {twoColumns ? 'grid-flow-col grid-cols-2' : ''}"
					{@attach grid => fitEntries(grid, ballot.Entries)}
				>
					{#each ballot.Entries as entry (entry.id)}
						{@const label = ballot.eventType === 'speech' ? entry.speakerOrder : entry.side}
						<div class="flex min-w-0 items-baseline gap-2">
							{#if label != null}
								<span class="min-w-7 shrink-0 text-xs font-semibold text-muted">{label}</span>
							{/if}
							<span class="truncate text-sm">{entry.code}</span>
						</div>
					{:else}
						<span class="text-sm italic text-muted">No entries assigned</span>
					{/each}
				</div>
			{:else}
				<div class="text-sm text-muted">
					{ballot.eventType === 'congress' ? (ballot.chair ? 'Parliamentarian' : 'Scorer') : 'Judge'}
				</div>
			{/if}
		</div>

		<!-- Action -->
		{#if ballot.onlineBallots}
			<div class="col-start-2 row-start-1 flex flex-col gap-1 self-start @2xl:col-start-3 @2xl:w-44 @2xl:self-center">
				{#if ballot.eventType === 'wudc' && !ballot.chair}
					<div class="rounded-md border border-primary-strong p-2 text-center text-xs font-semibold text-primary-strong @2xl:text-sm">
						Panelist<br />Only chairs enter ballots
					</div>
				{:else}
					<a class="{buttonColor} rounded px-3 py-1.5 text-center text-sm font-semibold uppercase whitespace-nowrap text-white @2xl:px-4 @2xl:py-2.5 @2xl:text-base" href={ballotHref}>
						{buttonText}
					</a>
				{/if}
				{#if ballot.legion}
					<a
						class="rounded border border-primary-strong px-3 py-1 text-center text-sm font-semibold text-primary-strong @2xl:px-4 @2xl:py-2 @2xl:text-base"
						href={`https://tabroom.com/user/judge/legion_comments.mhtml?panel_id=${ballot.id}&judge_id=${ballot.JudgeId}`}
					>
						Feedback
					</a>
				{/if}
			</div>
		{/if}
	</div>
	{#if ballot.ballotText}
		<div class="mt-2 border-t border-border pt-2 text-sm italic text-muted">{ballot.ballotText}</div>
	{/if}
</div>
