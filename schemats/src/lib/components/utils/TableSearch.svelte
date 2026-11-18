<script generics="TData extends import('@tanstack/svelte-table').RowData" lang="ts">
/**
 * Search one column at a time, like SVGrid's filter bar: pick a column, then type text or
 * pick one of its `meta.filterOptions`. Filterable columns are the table's leaf columns that
 * can filter, hidden ones included, ordered by `meta.filterOrder`.
 * Render it in Table's `above` snippet: `{#snippet above(table)}<TableSearch {table} />{/snippet}`
 */
	import { Select, TextInput } from '#lib/components/forms/index.ts';
	import type { AppTable } from './table.types';

	let {
		table,
		placeholder = 'Search',
	}: {
		table: AppTable<TData>,
		placeholder?: string,
	} = $props();

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
	<!-- Bottom-aligned: only the column picker shows its label -->
	<div class="mb-2 flex flex-wrap items-end gap-2" role="search">
		<!-- a lone searchable column needs no picker; the input's label names it -->
		{#if columns.length > 1}
			<Select
				class="min-w-40"
				label="Search by"
				onchange={pickColumn}
				options={columns.map((column) => ({ value: column.id, label: column.label }))}
				size="sm"
				value={selected.id}
			/>
		{/if}
		{#if selected.options}
			<Select
				class="min-w-32"
				hideLabel
				label="{selected.label} value"
				onchange={search}
				options={[{ value: '', label: 'Any' }, ...selected.options.map((option) => ({ value: option, label: option }))]}
				size="sm"
				bind:value
			/>
		{:else}
			<TextInput
				class="w-64 max-w-full"
				hideLabel
				label="Search {selected.label}"
				oninput={search}
				placeholder="{placeholder} {selected.label}"
				size="sm"
				type="search"
				bind:value
			/>
		{/if}
	</div>
{/if}
