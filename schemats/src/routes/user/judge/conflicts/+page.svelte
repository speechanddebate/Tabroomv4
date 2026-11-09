<script lang="ts">
	/*
	 * A judge's conflict sheet at one tournament: what they've marked, and what they may still mark.
	 * The server decides both; a refused mark comes back as a 409 the toast explains, and the sheet
	 * refetches either way since it may have moved on.
	 */
	import type { ConflictCandidate, JudgeConflict, JudgeConflictRequest, JudgeConflicts } from '@tabroom/types';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { renderSnippet } from '@tanstack/svelte-table';
	import Button from '$lib/components/Button.svelte';
	import Table from '$lib/components/utils/Table.svelte';
	import TableSearch from '$lib/components/utils/TableSearch.svelte';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';
	import { handleMutation, handleOrval } from '$lib/helpers/query';
	import { toast } from '$lib/helpers/toasts';
	import { createRestJudgesConflictAdd, createRestJudgesConflictRemove, createRestJudgesConflicts, getUserHomeQueryKey } from '$indexcards';
	import type { PageData } from './$types';
	import { conflictLabel, matchesFilter, removeHint, searchText, stateText, studentList } from './sheet';

	const { data }: { data: PageData } = $props();

	const queryClient = useQueryClient();
	const sheetQuery = createRestJudgesConflicts(() => data.judgeId);
	const sheet = $derived(handleOrval(sheetQuery));
	const add = createRestJudgesConflictAdd();
	const remove = createRestJudgesConflictRemove();

	let busy = $state(false);

	// the home card lists the same rows, so it refetches too
	async function changed() {
		await Promise.all([sheetQuery.refetch(), queryClient.invalidateQueries({ queryKey: getUserHomeQueryKey() })]);
	}

	async function mark(type: JudgeConflictRequest['type'], id: number) {
		busy = true;
		const added = await handleMutation(() => add.mutateAsync({ judgeId: data.judgeId, data: { type, id } }));
		if (added) toast.success({ message: `Conflict marked with ${conflictLabel(added)}` });
		await changed();
		busy = false;
	}

	// a 204 has no body to test, so a refusal is noticed through the problem handler
	async function unmark(conflict: JudgeConflict) {
		busy = true;
		let refused = false;
		await handleMutation(() => remove.mutateAsync({ judgeId: data.judgeId, strikeId: conflict.id }), {
			Problem: (problem, callDefault) => { refused = true; callDefault(problem); },
		});
		if (!refused) toast.success({ message: `Conflict with ${conflictLabel(conflict)} removed` });
		await changed();
		busy = false;
	}

	const enteredBy = (conflict: JudgeConflict) => {
		if (!conflict.EnteredBy) return '';
		return conflict.EnteredBy.role === 'tab' ? 'Tab staff' : `${conflict.EnteredBy.first ?? ''} ${conflict.EnteredBy.last ?? ''}`.trim();
	};

	type Region = JudgeConflicts['Candidates']['Regions'][number];

	const conflictColumns = createAppColumnHelper<JudgeConflict>();
	const markedColumns = conflictColumns.columns([
		conflictColumns.display({ id: 'conflict', header: 'Conflict', cell: ({ row }) => conflictLabel(row.original) }),
		conflictColumns.display({ id: 'enteredBy', header: 'Entered by', cell: ({ row }) => enteredBy(row.original) }),
		conflictColumns.display({ id: 'remove', header: '', cell: ({ row }) => renderSnippet(removeCell, row.original), size: 120 }),
	]);

	// one hidden column carries the search text, so the search box covers school, code, and competitors at once
	const candidateColumns = createAppColumnHelper<ConflictCandidate>();
	const entryColumns = candidateColumns.columns([
		candidateColumns.accessor((entry) => entry.School?.name ?? '', { id: 'school', header: 'School', enableColumnFilter: false }),
		candidateColumns.accessor((entry) => entry.code ?? entry.name ?? '', { id: 'entry', header: 'Entry', enableColumnFilter: false }),
		candidateColumns.accessor((entry) => entry.Event.abbr ?? entry.Event.name ?? '', { id: 'event', header: 'Event', enableColumnFilter: false, size: 80 }),
		candidateColumns.accessor(studentList, { id: 'students', header: 'Competitors', enableColumnFilter: false }),
		candidateColumns.display({ id: 'mark', header: '', cell: ({ row }) => renderSnippet(markCell, row.original), size: 220 }),
		candidateColumns.accessor(searchText, {
			id: 'search',
			header: 'school, code, or competitor',
			filterFn: (row, _column, filter: string) => matchesFilter(row.original, filter),
		}),
	]);

	const regionColumns = createAppColumnHelper<Region>();
	const regionTable = regionColumns.columns([
		regionColumns.accessor((region) => region.name ?? '', { id: 'region', header: 'Region' }),
		regionColumns.display({ id: 'mark', header: '', cell: ({ row }) => renderSnippet(regionCell, row.original), size: 120 }),
	]);

	const heading = 'text-base font-semibold text-text';
</script>

{#snippet removeCell(conflict: JudgeConflict)}
	{#if conflict.removable}
		<Button color="danger" disabled={busy} onclick={() => unmark(conflict)} size="sm" variant="outline">Remove</Button>
	{:else}
		<span class="text-xs text-muted">{removeHint(conflict)}</span>
	{/if}
{/snippet}

{#snippet markCell(entry: ConflictCandidate)}
	{@const reason = stateText(entry)}
	{#if reason === null}
		<Button color="danger" disabled={busy} onclick={() => mark('entry', entry.id)} size="sm">Conflict</Button>
		{#if entry.School}
			<Button color="danger" disabled={busy} onclick={() => mark('school', entry.school!)} size="sm" variant="outline">Whole school</Button>
		{/if}
	{:else}
		<span class="text-xs text-muted">{reason}</span>
	{/if}
{/snippet}

{#snippet regionCell(region: Region)}
	<Button color="danger" disabled={busy} onclick={() => mark('region', region.id)} size="sm">Conflict</Button>
{/snippet}

{#if sheet}
	<h2>Conflicts at {sheet.Tourn.name}</h2>
	<p class="mt-1 text-sm text-muted">
		{sheet.Judge.first} {sheet.Judge.last}{#if sheet.Judge.code}&nbsp;({sheet.Judge.code}){/if},
		{sheet.Judge.School ? `judging for ${sheet.Judge.School.name}` : 'a tournament hire'}.
		Mark the competitors and schools you have a coaching or personal relationship with and should not judge.
	</p>

	<section class="mt-4">
		<h3 class="{heading} mb-1">Your conflicts</h3>
		<Table
			caption="Your conflicts at this tournament"
			columns={markedColumns}
			data={sheet.Strikes}
			emptyMessage="None marked yet."
			enableSorting={false}
			getRowId={(conflict) => String(conflict.id)}
		/>
	</section>

	{#if !sheet.editable}
		<p class="mt-4 rounded-md border border-border bg-surface-alt px-4 py-3 text-sm text-text">
			This tournament doesn't take conflicts from judges. Ask your coach or the tab room to record one.
		</p>
	{:else if sheet.Tourn.mockTrial}
		<section class="mt-4">
			<h3 class="{heading} mb-1">Regions you could judge</h3>
			<Table
				caption="Regions you could judge"
				columns={regionTable}
				data={sheet.Candidates.Regions}
				emptyMessage="Every region is marked."
				enableSorting={false}
				getRowId={(region) => String(region.id)}
			/>
		</section>
	{:else}
		<section class="mt-4">
			<h3 class="{heading} mb-1">Entries in your category</h3>
			<Table
				caption="Entries in your category"
				columnVisibility={{ search: false }}
				columns={entryColumns}
				data={sheet.Candidates.Entries}
				emptyMessage="No entries yet."
				enableSorting={false}
				getRowClassName={(entry) => entry.state === 'open' ? '' : 'text-muted'}
				getRowId={(entry) => String(entry.id)}
			>
				{#snippet above(table)}
					<TableSearch placeholder="Filter by" {table} />
				{/snippet}
			</Table>
		</section>
	{/if}
{:else}
	<p class="text-sm text-muted">Loading your conflicts…</p>
{/if}
