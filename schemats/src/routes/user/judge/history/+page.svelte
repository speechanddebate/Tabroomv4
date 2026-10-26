<script lang="ts">
	import { resolve } from '$app/paths';
	import { renderSnippet } from '@tanstack/svelte-table';
	import { createUserJudgesHistory } from '$indexcards';
	import type { JudgeHistory } from '$indexcards/schemas/judgeHistory';
	import QueryTable from '$lib/components/utils/QueryTable.svelte';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';
	import { parseDateTime, showDateRange } from '$lib/helpers/dt';
	import { createPaging } from '$lib/helpers/paging.svelte';
	import { PAGE_SIZE } from './pageSize';

	const paging = createPaging(PAGE_SIZE);
	const historyQuery = createUserJudgesHistory(paging.params, paging.options);

	const columnHelper = createAppColumnHelper<JudgeHistory>();
		const columns = columnHelper.columns([
			columnHelper.accessor('Tourn.name', {
				id: 'name',
				header: 'Tournament',
				cell: (info) => renderSnippet(tournLink, info.row.original.Tourn),
			}),
			columnHelper.accessor((row) => parseDateTime({ dtISO: row.Tourn.start, tz: row.Tourn.tz }).year, {
				id: 'year',
				header: 'Year',
				size: 60,
				maxSize: 60,
			}),
			columnHelper.display({
				id: 'dates',
				header: 'Dates',
				cell: ({ row }) => {
					const span = row.original.Weekend ?? row.original.Tourn;
					return showDateRange({
						startISO: span.start,
						endISO: span.end,
						tz: row.original.Tourn.tz,
						mode: 'date',
						format: 'short',
					}).dateOutput?.trim() ?? '';
				},
			}),
			columnHelper.accessor('division', {
				id: 'division',
				header: 'Division',
			}),
			columnHelper.display({
				id: 'rounds',
				header: 'Rounds',
				cell: ({ row }) => {
					return `${row.original.roundsJudged}/${row.original.roundsObligated}`;
				},
				size: 80,
				meta: { title: 'Rounds judged/Rounds obligated' },
			}),
		]);
</script>

{#snippet tournLink(tourn: JudgeHistory['Tourn'])}
	<a
		class="text-primary-strong hover:underline"
		href={resolve('/user/judge/history/[tournId]', { tournId: String(tourn.id) })}
	>{tourn.name}</a>
{/snippet}

<h2>Judging History</h2>
<QueryTable
	caption="Judging history"
	{columns}
	enableSorting={false}
	getRowId={(row) => String(row.id)}
	{paging}
	query={historyQuery}
/>
