<script generics="TData extends import('@tanstack/svelte-table').RowData" lang="ts">
/**
 * Previous/next paging and the row range for a Table with a `pageSize`.
 * Render it in Table's `below` snippet: `{#snippet below(table)}<TablePager {table} />{/snippet}`
 */
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import type { AppTable } from './table.types';

	let { table, disabled = false }: {
		table: AppTable<TData>;
		/** Blocks paging, e.g. while a manually paginated table is fetching */
		disabled?: boolean;
	} = $props();

	const pagination = $derived(table.atoms.pagination.get());
	const rowCount = $derived(table.getRowCount());
	const pageCount = $derived(table.getPageCount());
	const first = $derived(rowCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1);
	const last = $derived(Math.min(rowCount, (pagination.pageIndex + 1) * pagination.pageSize));
</script>

<div class="mt-2 flex items-center justify-end gap-2 text-sm">
	<span aria-live="polite">
		{first}-{last} of {rowCount}
	</span>
	{#if pageCount > 1}
		<Button
			disabled={disabled || !table.getCanPreviousPage()}
			label="Previous page"
			onclick={() => table.previousPage()}
			size="sm"
			variant="outline"
		>
			<ChevronLeft class="size-4" />
		</Button>
		<span>Page {pagination.pageIndex + 1} of {pageCount}</span>
		<Button
			disabled={disabled || !table.getCanNextPage()}
			label="Next page"
			onclick={() => table.nextPage()}
			size="sm"
			variant="outline"
		>
			<ChevronRight class="size-4" />
		</Button>
	{/if}
</div>
