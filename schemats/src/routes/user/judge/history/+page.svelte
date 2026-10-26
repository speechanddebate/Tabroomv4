<script lang="ts">
    import QueryTable from '$lib/components/utils/QueryTable.svelte';
	import { createUserJudgesHistory } from '$indexcards';
	import type { JudgeHistory } from '$indexcards/schemas/judgeHistory';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';
	import { parseDateTime, showDateRange } from '$lib/helpers/dt';

	const historyQuery = createUserJudgesHistory();
	const columnHelper = createAppColumnHelper<JudgeHistory>();
		const columns = columnHelper.columns([
			columnHelper.accessor('Tourn.name', {
				id: 'name',
				header: 'Tournament',
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
			}),
		]);
</script>
<h2>Judging History</h2>
<QueryTable
	{columns}
	getRowId={(row) => String(row.id)}
	query={historyQuery}
	/>
