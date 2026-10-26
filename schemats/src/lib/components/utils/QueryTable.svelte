<script
	generics="TResponse extends import('$lib/helpers/query').OrvalEnvelope"
	lang="ts"
>
	/**
	 * this is a wrapper around Table.svelte that can take a Orval generated query and automatically
	 * extract the data and infer loading states.
	 *
	 * For a paginated `{ items, total }` endpoint, create the query with a Paging (see
	 * $lib/helpers/paging.svelte) and pass it as `paging`: the table pages it and keeps the
	 * current page on screen while the next loads.
	*/
	import type { RowData } from '@tanstack/svelte-table';
	import Table from './Table.svelte';
	import { handleOrval, isPaginatedData, type ExtractedRow, type OrvalEnvelope, type PaginatedData } from '$lib/helpers/query';
	import type { Paging } from '$lib/helpers/paging.svelte';
	import type { TableProps } from './table.types';
    import type { CreateInfiniteQueryResult, CreateQueryResult } from '@tanstack/svelte-query';
    import type { Problem } from '@tabroom/types';

	type TableRow = Extract<ExtractedRow<TResponse>, RowData>;

	type Props = Omit<TableProps<TableRow>, 'data'> & {
		data?: TableRow[] | null | undefined;
		query: CreateQueryResult<TResponse, Problem> | CreateInfiniteQueryResult<TResponse, Problem>,
		/** The page state the query was created with. The table pages it. */
		paging?: Paging;
	};

	let {
		query,
		paging,
		...tableProps
	}: Props = $props();

	const resolvedData = $derived.by(() => {
		// If query is a QueryLike (has 'data' property), call handleRequest
		//basically if this is an orval query
		if (query && typeof query === 'object' && 'data' in query) {
			return handleOrval(query as CreateQueryResult<OrvalEnvelope, Problem>);
		}
		throw Error('Unsupported query type');
	});

	// The response is either the rows themselves or a page of them
	const page = $derived(isPaginatedData(resolvedData) ? (resolvedData as PaginatedData<TableRow>) : null);
	const rows = $derived((page ? page.items : resolvedData) as TableRow[] | null);
	const rowCount = $derived(page ? page.total : tableProps.rowCount);
</script>

{#if paging}
	<Table
		{...tableProps}
		data={rows}
		isError={query.isError}
		isFetching={query.isFetching}
		isLoading={query?.isLoading}
		onPaginationChange={(next) => (paging.pagination = next)}
		pager
		pagination={paging.pagination}
		problem={query.error}
		{rowCount}
	/>
{:else}
	<Table
		{...tableProps}
		data={rows}
		isError={query.isError}
		isLoading={query?.isLoading}
		problem={query.error}
		{rowCount}
	/>
{/if}
