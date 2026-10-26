<script lang="ts">
	import type { JudgeTournHistoryTourn, JudgeTournRecord } from '$indexcards/schemas';
	import AssignedRounds from './AssignedRounds.svelte';
	import EnteredResults from './EnteredResults.svelte';

	let { judge, tourn }: { judge: JudgeTournRecord; tourn: JudgeTournHistoryTourn } = $props();

	const division = $derived(
		judge.Category.abbr ? `${judge.Category.name} (${judge.Category.abbr})` : judge.Category.name ?? '',
	);
	const rounds = $derived([
		judge.obligation ? `${judge.obligation} for school` : '',
		judge.hired ? `${judge.hired} hired` : '',
	].filter(Boolean).join(', '));
	// Flights only get a mention when a round was split into more than one
	const roundsJudged = $derived(
		judge.roundsJudged === judge.flightsJudged
			? String(judge.roundsJudged)
			: `${judge.roundsJudged} (${judge.flightsJudged} flights)`,
	);
</script>

{#snippet row(label: string, value: string)}
	<div class="flex gap-4 px-3 py-1 text-sm">
		<dt class="w-1/3 shrink-0 font-semibold sm:w-1/4">{label}</dt>
		<dd class="grow">{value}</dd>
	</div>
{/snippet}

<section class="rounded-md border border-border bg-surface">
	<h3 class="px-3 py-2 text-base font-semibold">{division}</h3>
	<dl class="flex flex-col divide-y divide-border border-y border-border bg-surface-alt">
		{@render row('Judging for', judge.School?.name ?? 'Volunteer/Hire')}
		{#if judge.code}
			{@render row('Judge code', judge.code)}
		{/if}
		{#if rounds}
			{@render row('Rounds', rounds)}
		{/if}
		{@render row('Rounds judged', roundsJudged)}
	</dl>
	{#if judge.Panels.length > 0}
		<div class="p-3">
			<h4 class="mb-2 text-sm font-semibold">Assigned Rounds</h4>
			<AssignedRounds panels={judge.Panels} {tourn} />
		</div>
	{/if}
	{#if judge.Results.length > 0}
		<div class="p-3">
			<h4 class="mb-2 text-sm font-semibold">Entered Results</h4>
			<EnteredResults results={judge.Results} />
		</div>
	{/if}
</section>
