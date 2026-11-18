<script lang='ts'>
	import type { BallotContext, OtherBallotContext } from '@tabroom/types';
	import { resolve } from '$app/paths';
	import { showTime } from '#lib/helpers/dt.ts';
	import { ExternalLink } from '@lucide/svelte';

	type Props = {
		context: Exclude<BallotContext, OtherBallotContext>;
	};

	let { context }: Props = $props();

	// The round's schematic needs the event abbr and round number; without them, the tournament's rounds
	const schematicUrl = $derived(
		context.Event.abbr && context.Round.name !== null
			? resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]', {
				tourn: String(context.Tourn.id),
				eventAbbr: context.Event.abbr,
				roundNumber: String(context.Round.name),
			})
			: resolve('/invite/[tourn]/rounds', { tourn: String(context.Tourn.id) })
	);

	// Classic counts down to the deadline and keeps going past it, in red
	let now = $state(Date.now());

	$effect(() => {
		if (!context.decisionDeadline) return;
		const timer = setInterval(() => { now = Date.now(); }, 1000);
		return () => clearInterval(timer);
	});

	const secondsLeft = $derived(
		context.decisionDeadline ? Math.trunc((Date.parse(context.decisionDeadline) - now) / 1000) : 0
	);

	const timeLeft = $derived.by(() => {
		const total = Math.abs(secondsLeft);
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = String(total % 60).padStart(2, '0');
		const clock = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
		return secondsLeft < 0 ? `-${clock}` : clock;
	});

	const judgeName = (judge: Props['context']['otherJudges'][number]) =>
		[judge.first, judge.middle, judge.last].filter(Boolean).join(' ');

	// Classic lists every student who has a pronoun, by last name
	const pronouns = $derived(
		context.Entries
			.flatMap((entry) => entry.Students.filter((student) => student.pronoun).map((student) => ({ ...student, code: entry.code })))
			.sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))
	);
</script>

{#snippet row(label: string)}
	<dt class='w-1/4 shrink-0 font-semibold'>{label}</dt>
{/snippet}

{#if context.logo}
	<div class='sidenote flex justify-center'>
		<img class='max-w-55' alt='Tournament logo' src={context.logo} />
	</div>
{/if}

<div class='sidenote'>
	<div class='flex items-baseline'>
		<h4 class='grow'>This round</h4>
		<span class='font-semibold text-warning'>
			Start: {showTime({ dtISO: context.roundStart, tz: context.tz })}
		</span>
	</div>

	<dl class='flex flex-col divide-y divide-border border-y border-border bg-surface-alt'>
		<div class='flex items-center gap-1 px-1 py-1'>
			{@render row('Round')}
			<dd class='grow'>
				<a
					class='font-semibold text-primary-strong underline'
					href={schematicUrl}
					rel='noopener noreferrer'
					target='_blank'
					title="Link to round's public schematic"
				>{context.Round.label ?? `${context.eventType === 'congress' ? 'Session' : 'Round'} ${context.Round.name ?? ''}`}</a>
			</dd>
		</div>

		{#if context.flight}
			<div class='flex gap-1 px-1 py-1'>
				{@render row('Flight')}
				<dd class='font-semibold text-primary-strong'>{context.flight}</dd>
			</div>
		{/if}

		{#if context.docShare}
			<div class='flex gap-1 px-1 py-1'>
				{@render row('Doc Share')}
				<dd class='min-w-0'>
					<a
						class='inline-flex items-center gap-1 font-semibold break-all text-primary-strong underline'
						href={context.docShare}
						rel='noopener noreferrer'
						target='_blank'
					>{context.docShare.replace(/^https?:\/\//, '')}<ExternalLink class='size-3 shrink-0' /></a>
				</dd>
			</div>
		{/if}

		{#if !context.onlineMode}
			<div class='flex gap-1 px-1 py-1'>
				{@render row('Room')}
				<dd class='font-semibold text-primary-strong'>{context.Room?.name ?? ''}</dd>
			</div>
		{/if}

		{#if context.otherJudges.length > 0}
			<div class='flex gap-1 px-1 py-1'>
				{@render row('Panel')}
				<dd>
					<ul>
						{#each context.otherJudges as judge, index (index)}
							<!-- Classic labels mock trial judges Presiding (red) or Scorer (blue) and other chairs "Chair:" -->
							{#if context.eventType === 'mock_trial'}
								<li class='font-semibold {judge.chair ? 'text-danger' : 'text-primary-strong'}'>
									{judge.chair ? 'Presiding' : 'Scorer'} {judgeName(judge)}
									{#if judge.pronoun}
										<span class='font-normal italic'>({judge.pronoun})</span>
									{/if}
								</li>
							{:else}
								<li>
									{#if judge.chair}<span class='font-semibold'>Chair:</span>{/if}
									{judgeName(judge)}
									{#if judge.pronoun}
										<span class='text-muted italic'>({judge.pronoun})</span>
									{/if}
								</li>
							{/if}
						{/each}
					</ul>
				</dd>
			</div>
		{/if}

		{#if pronouns.length > 0}
			<div class='flex gap-1 px-1 py-1'>
				{@render row('Pronouns')}
				<dd>
					<ul>
						{#each pronouns as student (student.id)}
							<li>
								{[student.code, student.first, student.middle, student.last].filter(Boolean).join(' ')}
								<span class='text-muted italic'>({student.pronoun})</span>
							</li>
						{/each}
					</ul>
				</dd>
			</div>
		{/if}

		{#if context.eventType === 'debate' && context.debate.sides === 'flip'}
			<div class='flex gap-1 px-1 py-1'>
				{@render row('Coin Flips')}
				<dd class='font-semibold {context.debate.flipStatus === 'done' ? 'text-success' : 'text-warning'}'>
					{context.debate.flipStatus === 'done' ? 'Complete' : 'Incomplete'}
				</dd>
			</div>
		{/if}

		{#if context.decisionDeadline}
			<div
				class='flex gap-1 px-1 py-1'
				title='This deadline is informative; your online ballot will not self-destruct when it expires. But please vote by the deadline; the tournament cannot progress without your ballot.'
			>
				{@render row('Deadline')}
				<dd class='font-semibold text-primary-strong'>
					{showTime({ dtISO: context.decisionDeadline, tz: context.tz })}
				</dd>
				<dt class='ml-auto font-semibold'>Time Left:</dt>
				<dd class='font-mono font-semibold {secondsLeft < 0 ? 'text-danger' : 'text-warning'}'>
					<span role='timer'>{timeLeft}</span>
				</dd>
			</div>
		{/if}
	</dl>
</div>

{#if context.timers}
	<div class='sidenote'>
		<h4>Timers</h4>
		<div class='rounded-md border-2 border-dashed border-border-strong p-4 text-center text-muted'>
			Timers
		</div>
	</div>
{/if}

{#if context.pointScale.length > 0}
	<div class='sidenote'>
		<h5 class='text-xl font-semibold text-primary-strong'>Point Scale</h5>
		<ul class='flex flex-col divide-y divide-border border-y border-border bg-surface-alt'>
			{#each context.pointScale as line, index (index)}
				<li class='flex gap-2 px-1 py-0.5'>
					{#if line.points}
						<span class='w-1/5 shrink-0 font-semibold text-primary-strong'>{line.points}</span>
					{/if}
					<span>{line.description}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#if context.speechTimes.length > 0}
	<div class='sidenote'>
		<h5 class='text-xl font-semibold text-primary-strong'>Speech Times</h5>
		<ul class='flex flex-col divide-y divide-border border-y border-border bg-surface-alt'>
			{#each context.speechTimes as line, index (index)}
				<li class='flex gap-2 px-1 py-0.5'>
					<span class='grow font-semibold'>{line.speech}</span>
					{#if line.time}
						<span class='text-right'>{line.time}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
