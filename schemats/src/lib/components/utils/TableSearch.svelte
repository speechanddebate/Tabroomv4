<script generics="TData extends import('@tanstack/svelte-table').RowData" lang="ts">
/**
 * Search one column at a time, like SVGrid's filter bar: pick a column, then type text or
 * pick one of its `meta.filterOptions`. Filterable columns are the table's leaf columns that
 * can filter, hidden ones included, ordered by `meta.filterOrder`.
 * Render it in Table's `above` snippet: `{#snippet above(table)}<TableSearch {table} />{/snippet}`
 */
	import type { AppTable } from './table.types';

	let {
		table,
		placeholder = 'Search',
	}: {
		table: AppTable<TData>,
		placeholder?: string,
	} = $props();

	const id = $props.id();

	type Searchable = { id: string; label: string; options?: string[]; order: number };

	const columns: Searchable[] = $derived(
		table.getAllLeafColumns()
			.filter((column) => column.getCanFilter())
			.map((column) => {
				const { header, meta } = column.columnDef;
				return {
					id: column.id,
					label: meta?.filterLabel ?? (typeof header === 'string' && header ? header : column.id),
					options: meta?.filterOptions,
					order: meta?.filterOrder ?? 50,
				};
			})
			.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
	);

	let columnId = $state('');
	let value = $state('');

	const selected = $derived(columns.find((column) => column.id === columnId) ?? columns[0]);

	// One filter at a time; an empty value clears it
	function search() {
		const text = value.trim();
		table.setColumnFilters(text && selected ? [{ id: selected.id, value: text }] : []);
	}

	function pickColumn(event: Event & { currentTarget: HTMLSelectElement }) {
		columnId = event.currentTarget.value;
		value = '';
		search();
	}
</script>

{#if selected}
	<div class="mb-2 flex flex-wrap items-center gap-2" role="search">
		<!-- a lone searchable column needs no picker; the input's label names it -->
		{#if columns.length > 1}
			<label class="text-xs font-semibold" for="{id}-column">Search by</label>
			<select
				id="{id}-column"
				class="rounded border border-border-strong bg-surface py-1 pr-8 pl-2 text-sm"
				onchange={pickColumn}
				value={selected.id}
			>
				{#each columns as column (column.id)}
					<option value={column.id}>{column.label}</option>
				{/each}
			</select>
		{/if}
		{#if selected.options}
			<select
				class="rounded border border-border-strong bg-surface py-1 pr-8 pl-2 text-sm"
				aria-label="{selected.label} value"
				onchange={search}
				bind:value
			>
				<option value="">Any</option>
				{#each selected.options as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		{:else}
			<input
				class="w-64 max-w-full rounded border border-border-strong px-2 py-1 text-sm"
				aria-label="Search {selected.label}"
				oninput={search}
				placeholder="{placeholder} {selected.label}"
				type="search"
				bind:value
			/>
		{/if}
	</div>
{/if}
