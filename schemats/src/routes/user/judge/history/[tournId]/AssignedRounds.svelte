<script lang="ts">
	import { renderSnippet } from '@tanstack/svelte-table';
	import { resolve } from '$app/paths';
	import type { JudgeHistoryPanel, JudgeTournHistoryTourn } from '$indexcards/schemas';
	import Table from '$lib/components/utils/Table.svelte';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';
	import { showTime } from '$lib/helpers/dt';

	let { panels, tourn }: { panels: JudgeHistoryPanel[]; tourn: JudgeTournHistoryTourn } = $props();

	const roundName = (panel: JudgeHistoryPanel) =>
		`${panel.Event.abbr ?? ''} ${panel.Round.label || `Round ${panel.Round.name}`}`.trim();

	// Speech and WUDC entries are known by code; debate entries by name
	const entryName = (panel: JudgeHistoryPanel, entry: JudgeHistoryPanel['Entries'][number]) =>
		(panel.Event.type === 'speech' || panel.Event.type === 'wudc' ? entry.code : entry.name ?? entry.code) ?? '';

	const columnHelper = createAppColumnHelper<JudgeHistoryPanel>();
	const columns = columnHelper.columns([
		columnHelper.display({
			id: 'round',
			header: 'Round',
			cell: ({ row }) => renderSnippet(roundCell, row.original),
		}),
		columnHelper.accessor((panel) => panel.Room?.name ?? 'No Room Listed', {
			id: 'room',
			header: 'Room',
		}),
		columnHelper.accessor((panel) => panel.start ? showTime({ dtISO: panel.start, tz: tourn.tz, format: 'daytime' }) : '', {
			id: 'starts',
			header: 'Starts',
		}),
		columnHelper.display({
			id: 'entries',
			header: 'Entries',
			cell: ({ row }) => renderSnippet(entriesCell, row.original),
			meta: { truncate: false },
		}),
	]);
</script>

{#snippet roundCell(panel: JudgeHistoryPanel)}
	<a
		class="text-primary-strong hover:underline"
		href={resolve('/invite/[tourn]/rounds/[eventAbbr]/[roundNumber]', {
			tourn: tourn.webname,
			eventAbbr: panel.Event.abbr ?? '',
			roundNumber: String(panel.Round.name ?? ''),
		})}
	>{roundName(panel)}</a>
	{#if panel.flight}
		<span class="ml-2 text-muted">Flight {panel.flight}</span>
	{/if}
{/snippet}

{#snippet entriesCell(panel: JudgeHistoryPanel)}
	<div class="flex flex-col gap-0.5 py-0.5">
		{#each panel.Entries as entry (entry.id)}
			<div class="flex gap-2">
				<span class="w-10 shrink-0 text-muted">{entry.side ?? ''}</span>
				<span>{entryName(panel, entry)}</span>
			</div>
		{/each}
	</div>
{/snippet}

<Table
	caption="Assigned rounds"
	{columns}
	data={panels}
	enableSorting={false}
	getRowId={(panel) => String(panel.id)}
/>
