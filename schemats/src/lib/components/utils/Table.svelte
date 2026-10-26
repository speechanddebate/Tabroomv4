<script generics="TData extends import('@tanstack/svelte-table').RowData" lang="ts">
/**
 * This should always remain JUST the table (and its pager), any extra features like toolbars, query handling, etc
 * should be implemented in wrapper components (like QueryTable.svelte) that use this component under the hood.
*/
	import {
		FlexRender,
		functionalUpdate,
		type PaginationState,
		type Updater,
	} from '@tanstack/svelte-table';
	import type { TableProps } from './table.types';
	import { createAppTable } from './table.hook';
	import TablePager from './TablePager.svelte';
	import { Spinner } from 'flowbite-svelte';

	let {
		data = $bindable(),
		columns,
		onRowClick,
		getRowClassName,
		getRowId,
		enableSorting = true,
		columnVisibility = $bindable({}),
		columnFilters = $bindable([]),
		pageSize,
		pagination,
		onPaginationChange,
		rowCount,
		pager = false,
		isFetching = false,
		enableColumnResizing = true,
		columnResizeMode = 'onChange',
		striped = true,
		caption,
		containerClass = 'bg-surface w-full',
		tableClass = 'w-full text-sm border-collapse border border-border-strong rounded',
		headerClass = 'text-left px-4 py-1 text-[11px] font-semibold bg-accent-soft border border-accent',
		cellClass = 'px-4 py-1 border border-border text-[12px] leading-4',
		footerClass = 'text-left px-4 py-1 text-[11px] bg-surface-alt border border-border',
		emptyMessage = 'No data available',
		above,
		below,
		...props
	}: TableProps<TData> = $props();

	// A table is controlled for its lifetime: with `pagination` the page owns the page state and
	// the table reads it from the prop; otherwise TanStack keeps its own, seeded from pageSize
	// svelte-ignore state_referenced_locally
	const controlled = pagination !== undefined;

	// The props own visibility and filters, so a page can set them and anything that
	// changes them (a column menu, TableSearch) writes back to them
	const state = {
		get columnVisibility() {
			return columnVisibility;
		},
		get columnFilters() {
			return columnFilters;
		},
	};
	if (controlled) {
		Object.defineProperty(state, 'pagination', { enumerable: true, get: () => pagination });
	}

	// svelte-ignore state_referenced_locally
	const table = createAppTable({
		getRowId,
		enableSorting,
		enableColumnResizing,
		columnResizeMode,
		// Manual pagination treats the data as the current page: without a page size every row
		// shows, and with `pagination` the page fetches each page itself
		manualPagination: controlled || pageSize === undefined,
		initialState: {
			pagination: { pageIndex: 0, pageSize: pageSize ?? 10 },
		},
		get rowCount() {
			return rowCount;
		},
		get data() {
			return data ?? [];
		},
		get columns() {
			return columns;
		},
		state,
		onColumnVisibilityChange: (updater) => {
			columnVisibility = functionalUpdate(updater, columnVisibility);
		},
		onColumnFiltersChange: (updater) => {
			columnFilters = functionalUpdate(updater, columnFilters);
		},
		// Only a controlled table overrides TanStack's own pagination updater; an explicit undefined would disable it
		...(controlled && {
			onPaginationChange: (updater: Updater<PaginationState>) =>
				onPaginationChange?.(functionalUpdate(updater, pagination as PaginationState)),
		}),
	});

	// Non-resizable columns are locked at their size; the rest share the remaining width.
	// A 1% width resolves to max(1% of the table, min-width, min-content) in auto layout,
	// so the column stays at its size and doesn't take a share of the extra space.
	function isLockedWidth(column: { columnDef: { enableResizing?: boolean } }): boolean {
		return column.columnDef.enableResizing === false;
	}

	// A shallow leaf column under grouped headers gets a chain of placeholders above its
	// real header. The top placeholder spans the chain (rowSpan > 1) and stands in for the
	// leaf header; the headers it covers report rowSpan 0 and aren't rendered.
	function showsColumn(header: { isPlaceholder: boolean; rowSpan: number }): boolean {
		return !header.isPlaceholder || header.rowSpan > 1;
	}

	// getFooterGroups() has a header for every column, so only render the
	// footer when a column actually defines one
	function hasDefinedFooters(t: typeof table): boolean {
		return t.getFooterGroups().some((fg) => fg.headers.some((h) => h.column.columnDef.footer));
	}
</script>

<div class={['tabroom-table', containerClass, striped && 'table-striped']}>
	{@render above?.(table)}
	<div class="table-scroll-region">
		<table
			style:table-layout="auto"
			class={tableClass}
		>
			{#if caption}
				<caption class="sr-only">{caption}</caption>
			{/if}
			<thead>
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<tr>
						{#each headerGroup.headers as header (header.id)}
							{#if header.rowSpan > 0}
							<!-- only leaf columns set widths; a group header's width comes from its leaves -->
							{@const isLeaf = header.column.columns.length === 0}
							{@const locked = isLeaf && isLockedWidth(header.column)}
							<th
								style:width={!isLeaf ? undefined : locked ? '1%' : `${header.getSize()}px`}
								style:min-width={locked ? `${header.getSize()}px` : undefined}
								class={`${headerClass} table-header-cell`}
								colspan={header.colSpan > 1 ? header.colSpan : undefined}
								rowspan={header.rowSpan > 1 ? header.rowSpan : undefined}
								scope={header.colSpan > 1 ? 'colgroup' : 'col'}
							>
								{#if showsColumn(header)}
									{#if header.column.getCanSort()}
										<button
											class="table-sort-button"
											onclick={header.column.getToggleSortingHandler()}
											type="button"
										>
											<span class="table-header-content">
												<FlexRender {header} />
											</span>
											<span class="table-sort-chevrons" aria-hidden="true">
												<span
													class="table-sort-chevron table-sort-chevron-up"
													class:table-sort-chevron-active={
														header.column.getIsSorted() === 'asc'
													}
												></span>
												<span
													class="table-sort-chevron table-sort-chevron-down"
													class:table-sort-chevron-active={
														header.column.getIsSorted() === 'desc'
													}
												></span>
											</span>
										</button>
									{:else}
										<div class="table-header-content">
											<FlexRender {header} />
										</div>
									{/if}
									{#if header.column.getCanResize()}
										<button
											class="table-column-resizer"
											class:table-column-resizer-active={header.column.getIsResizing()}
											aria-label="Resize column"
											ondblclick={() => header.column.resetSize()}
											onmousedown={header.getResizeHandler()}
											ontouchstart={header.getResizeHandler()}
											type="button"
										></button>
									{/if}
								{/if}
							</th>
							{/if}
						{/each}
					</tr>
				{/each}
			</thead>
			<tbody>
				{#if props.isLoading }
				<tr>
					<td class="table-empty-cell" colspan={table.getVisibleLeafColumns().length}>
						<Spinner />
					</td>
				</tr>
				{:else if props.isError}
				<tr>
					<td class="table-empty-cell" colspan={table.getVisibleLeafColumns().length}>

						<div class="table-error-stack">
							{#if props.problem}
								<div>{props.problem.title}</div>
								<div>{props.problem.detail}</div>
								<div>{props.problem.instance}</div>
							{:else}
								There was an Error fetching the table data.
						{/if}
						</div>
					</td>
				</tr>
				{:else if table.getRowModel().rows.length > 0}
					{#each table.getRowModel().rows as row (row.id)}
						<tr
							class={[getRowClassName?.(row.original), onRowClick && 'table-row-clickable']}
							onclick={onRowClick ? () => onRowClick(row.original) : undefined}
						>
							{#each row.getVisibleCells() as cell (cell.id)}
								<!-- covered cells are merged into a spanning cell above or before them; rowspan="0" would span the whole tbody -->
								{#if !cell.getIsCovered()}
									{@const meta = cell.column.columnDef.meta}
									<td
										class={[cellClass, meta?.cellClass]}
										colspan={cell.getColSpan() > 1 ? cell.getColSpan() : undefined}
										rowspan={cell.getRowSpan() > 1 ? cell.getRowSpan() : undefined}
										title={meta?.title}
									>
										{#if meta?.truncate === false}
											<FlexRender {cell} />
										{:else}
											<div class={['table-cell-content', isLockedWidth(cell.column) && 'table-cell-content-locked']}>
												<FlexRender {cell} />
											</div>
										{/if}
									</td>
								{/if}
							{/each}
						</tr>
					{/each}
				{:else}
					<tr>
						<td class="table-empty-cell" colspan={table.getVisibleLeafColumns().length}>
							{emptyMessage}
						</td>
					</tr>
				{/if}
			</tbody>
			{#if hasDefinedFooters(table)}
				<tfoot>
					{#each table.getFooterGroups() as footerGroup (footerGroup.id)}
						<tr>
							{#each footerGroup.headers as header (header.id)}
								<th class={footerClass} colspan={header.colSpan > 1 ? header.colSpan : undefined}>
									{#if !header.isPlaceholder}
										<div class="table-footer-content">
											<FlexRender footer={header} />
										</div>
									{/if}
								</th>
							{/each}
						</tr>
					{/each}
				</tfoot>
			{/if}
		</table>
	</div>
	{@render below?.(table)}
	{#if pager && (pagination !== undefined || pageSize !== undefined)}
		<TablePager disabled={isFetching} {table} />
	{/if}
</div>

<style>
	:global(.tabroom-table .table-scroll-region) {
		width: 100%;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
	}

	:global(.tabroom-table table),
	:global(.tabroom-table th),
	:global(.tabroom-table td) {
		box-sizing: border-box;
	}

	:global(.tabroom-table.table-striped tbody tr:nth-of-type(2n)) {
		background-color: var(--color-surface-alt);
	}

	:global(.tabroom-table tbody tr.table-row-clickable:hover) {
		background-color: var(--color-accent-soft);
	}

	:global(.tabroom-table .table-header-cell) {
		position: relative;
	}

	:global(.tabroom-table .table-column-resizer) {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 1;
		height: 100%;
		width: 6px;
		padding: 0;
		border: 0;
		cursor: col-resize;
		touch-action: none;
		user-select: none;
		opacity: 0;
		background-color: transparent;
	}

	:global(.tabroom-table .table-column-resizer:hover),
	:global(.tabroom-table .table-column-resizer:focus-visible),
	:global(.tabroom-table .table-column-resizer-active) {
		opacity: 1;
		background-color: var(--color-accent);
	}

	:global(.tabroom-table .table-sort-button) {
		display: inline-flex;
		width: 100%;
		max-width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		background: transparent;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	:global(.tabroom-table .table-header-content),
	:global(.tabroom-table .table-cell-content),
	:global(.tabroom-table .table-footer-content) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	/* Unwrapped text sets a minimum width for its column, so a locked column's content
	   is taken out of the column's sizing (width: 0) and clipped to it (min-width: 100%) */
	:global(.tabroom-table .table-cell-content-locked) {
		width: 0;
		min-width: 100%;
	}

	:global(.tabroom-table .table-sort-chevrons) {
		display: inline-flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 1px;
	}

	:global(.tabroom-table .table-sort-chevron) {
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		opacity: 0.35;
	}

	:global(.tabroom-table .table-sort-chevron-up) {
		border-bottom: 5px solid currentColor;
	}

	:global(.tabroom-table .table-sort-chevron-down) {
		border-top: 5px solid currentColor;
	}

	:global(.tabroom-table .table-sort-chevron-active) {
		opacity: 1;
	}

	:global(.tabroom-table .table-empty-cell) {
		padding: 1.5rem 1rem;
		text-align: center;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	:global(.tabroom-table .table-error-stack) {
		display: block;
		align-items: center;
		gap: 0.25rem;
		margin: 0.5rem 0;
	}
</style>
