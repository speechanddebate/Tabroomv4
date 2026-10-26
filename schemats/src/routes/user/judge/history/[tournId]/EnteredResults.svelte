<script lang="ts">
	import { renderSnippet } from '@tanstack/svelte-table';
	import type { JudgeHistoryResult, ScoreCell } from '$indexcards/schemas';
	import Table from '$lib/components/utils/Table.svelte';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';

	let { results }: { results: JudgeHistoryResult[] } = $props();

	type Entry = JudgeHistoryResult['Entries'][number];

	const roundName = (result: JudgeHistoryResult) =>
		`${result.Event.abbr ?? ''} ${result.Round.label || `Round ${result.Round.name}`}`.trim();

	// Speech entries are placed by speaking order (1st, 2nd); debate entries by side
	const ordinal = (n: number) => {
		const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
		return `${n}${suffix}`;
	};
	const position = (entry: Entry) => entry.side ?? (entry.speakerOrder ? ordinal(entry.speakerOrder) : '');

	// WUDC ranks are shown as team points, 3 for first down to 0 for fourth
	const scoreText = (scores: ScoreCell, eventType: string) => {
		if (eventType === 'wudc') {
			return scores.rank === null ? '' : `${4 - scores.rank} pts`;
		}
		return [scores.winloss, scores.rank, scores.point].filter(v => v !== null).join(' ');
	};
	const speakerText = (scores: ScoreCell) =>
		[scores.winloss, scores.rank, scores.point].filter(v => v !== null).join('-');

	const columnHelper = createAppColumnHelper<JudgeHistoryResult>();
	const columns = columnHelper.columns([
		columnHelper.display({
			id: 'round',
			header: 'Rnd',
			cell: ({ row }) => renderSnippet(roundCell, row.original),
		}),
		columnHelper.display({
			id: 'entries',
			header: 'Entry',
			cell: ({ row }) => renderSnippet(entriesCell, row.original),
			meta: { truncate: false },
		}),
		columnHelper.display({
			id: 'results',
			header: 'Results',
			cell: ({ row }) => renderSnippet(resultsCell, row.original),
			meta: { truncate: false },
		}),
		columnHelper.display({
			id: 'speakers',
			header: 'Speakers (Debate)',
			cell: ({ row }) => renderSnippet(speakersCell, row.original),
			meta: { truncate: false },
		}),
	]);
</script>

{#snippet roundCell(result: JudgeHistoryResult)}
	{roundName(result)}
	{#if result.flight}
		<span class="ml-2 text-muted">Flight {result.flight}</span>
	{/if}
{/snippet}

{#snippet entriesCell(result: JudgeHistoryResult)}
	<div class="flex flex-col gap-0.5 py-0.5">
		{#each result.Entries as entry (entry.id)}
			<div class="flex gap-2">
				<span class="w-10 shrink-0 text-muted">{position(entry)}</span>
				<span>{entry.code ?? ''}</span>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet resultsCell(result: JudgeHistoryResult)}
	<div class="flex flex-col gap-0.5 py-0.5">
		{#each result.Entries as entry (entry.id)}
			<div>{scoreText(entry.Scores, result.Event.type)}&nbsp;</div>
		{/each}
	</div>
{/snippet}

{#snippet speakersCell(result: JudgeHistoryResult)}
	<div class="flex flex-col gap-0.5 py-0.5">
		{#each result.Entries as entry (entry.id)}
			{#each entry.Students as student (student.id)}
				<div>{student.last}: {speakerText(student.Scores)}</div>
			{/each}
		{/each}
		{#if result.Winner}
			<div>{result.Winner.code} ({result.Winner.name}) wins {result.Winner.record}</div>
		{/if}
	</div>
{/snippet}

<Table
	caption="Entered results"
	{columns}
	data={results}
	enableSorting={false}
	getRowId={(result) => String(result.id)}
/>
