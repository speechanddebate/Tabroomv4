<script lang='ts'>
	import type { DebateBallotContext } from '@tabroom/types';
	import Button from '#lib/components/Button.svelte';
	import Table from '#lib/components/utils/Table.svelte';
	import WinnerSelect from '../WinnerSelect.svelte';
	import { DebateDraft, type DebateScores } from './draft.svelte';
	import PointsInput from './PointsInput.svelte';
	import { scoringColumns, scoringRowId, scoringRows, studentName, type ScoringRow } from './scoringGrid';

	type Props = {
		context: DebateBallotContext;
		submitting?: boolean;
		// Called with the scores as entered; the server checks them and the layout shows its errors
		onsubmit: (scores: DebateScores) => void;
	};

	let { context, submitting = false, onsubmit }: Props = $props();

	// Made once, so a context reload (a coin flip changing the sides) keeps what the judge entered
	// svelte-ignore state_referenced_locally
	const draft = new DebateDraft(context);

	const points = $derived(context.scoring.points);

	// Built from the context only, so typing doesn't rebuild the table and remount the inputs
	const rows = $derived(scoringRows(context));
	const columns = $derived(scoringColumns(context, { entry: entryCell, speaker: speakerCell, points: pointsCell }));

	// A heavier line over each entry's first speaker, since spanned groups aren't striped
	const firstRows = $derived(new Set(
		rows.filter((row, index) => index === 0 || rows[index - 1].ballot !== row.ballot).map(scoringRowId)
	));

	const doubled = $derived(context.Entries.some((entry) => entry.doubled > 0));

	// The judge marks an intended low-point win up front, so it doesn't take a refused submit to ask.
	// lpw is null when the round has no points
	const askLowPoint = $derived(context.scoring.winloss?.lpw === 'confirm');
</script>

{#snippet entryCell(row: ScoringRow)}
	{#if row.doubled > 0}
		<span class='pe-1 text-danger' title='Doubled entered in another category this round'>{'†'.repeat(row.doubled)}</span>
	{/if}{row.code}
{/snippet}

{#snippet speakerCell(row: ScoringRow)}
	{#if row.student}{studentName(row.student)}{:else}<span class='text-muted italic'>No speakers</span>{/if}
{/snippet}

{#snippet pointsCell(row: ScoringRow)}
	{#if row.student && points}
		{@const student = row.student.id}
		<PointsInput
			label='Points for {studentName(row.student)}'
			max={points.max}
			min={points.min}
			step={points.step}
			bind:value={() => draft.points[student] ?? null, (value) => (draft.points[student] = value ?? null)}
		/>
	{/if}
{/snippet}

<div class='flex flex-col gap-3'>
	<Table
		caption='Scores'
		{columns}
		data={rows}
		enableColumnResizing={false}
		enableSorting={false}
		getRowClassName={(row) => (firstRows.has(scoringRowId(row)) ? '[&>td]:border-t-2 [&>td]:border-t-border-strong' : '')}
		getRowId={scoringRowId}
		striped={false}
	/>

	{#if doubled}
		<!-- ballot.mhtml 2821-2828 -->
		<p class='my-0 text-center text-sm font-semibold text-danger'>
			† These entries are doubled entered in another category this round.
			Please accommodate their need to leave early, or wait for them to appear late.
		</p>
	{/if}

	{#if context.scoring.winloss}
		<WinnerSelect {context} bind:winner={draft.winner} bind:side={draft.side} />
	{/if}

	<!-- Like classic's Low-Point Ranks? box by the submit (ballot.mhtml 2850-2869) -->
	<div class='flex flex-wrap items-center justify-center gap-6'>
		{#if askLowPoint}
			<label class='flex cursor-pointer items-center gap-2 text-sm font-semibold'>
				<input type='checkbox' bind:checked={draft.lowPointWin} />
				Low-Point Win?
			</label>
		{/if}
		<Button color='primary' disabled={submitting} onclick={() => onsubmit(draft.toScores(context))}>Submit Ballot</Button>
	</div>
</div>
