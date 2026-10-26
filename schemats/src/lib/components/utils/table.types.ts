import type {
	ColumnDef,
	ColumnFiltersState,
	ColumnResizeMode,
	ColumnVisibilityState,
	PaginationState,
	RowData,
	SvelteTable,
} from '@tanstack/svelte-table';
import type { Snippet } from 'svelte';
import type { appFeatures } from './table.hook';
import type { Problem } from '@tabroom/types';

/** The table instance Table.svelte creates, as passed to its `above` and `below` snippets */
export type AppTable<TData extends RowData> = SvelteTable<typeof appFeatures, TData>;

/** Per-column render options read by Table.svelte, set with `meta` on a column def */
export type AppColumnMeta = {
	/** Clip body cell content to one line with an ellipsis. Turn off for inputs so focus rings aren't clipped. Defaults to true. */
	truncate?: boolean;
	/** Classes added to this column's body cells, after the table's cellClass */
	cellClass?: string;
	/** Hover text (the `title` attribute) on this column's body cells */
	title?: string;
	/** The column's name in TableSearch's column picker. Defaults to its header when that's a string. */
	filterLabel?: string;
	/** Fixed values to search by, shown as a dropdown in TableSearch instead of a text box */
	filterOptions?: string[];
	/** Where the column sits in TableSearch's column picker, lowest first. Defaults to 50. */
	filterOrder?: number;
};

export type TableProps<TData extends RowData> = {
	data: TData[] | null | undefined;
	columns: ColumnDef<typeof appFeatures, TData>[];
	/** Only when set are rows clickable and highlighted on hover */
	onRowClick?: (_row: TData) => void;
	getRowClassName?: (_row: TData) => string;
	/** Stable row ids, so rows (and any inputs in them) keep their identity when data is reordered. Defaults to the row index. */
	getRowId?: (_row: TData, _index: number) => string;
	enableSorting?: boolean;
	/** Columns to hide, by column id: `{ id: false }`. Columns not listed are shown. Bindable. */
	columnVisibility?: ColumnVisibilityState;
	/** Active column filters: `[{ id: 'name', value: 'state' }]`. Hidden columns can be filtered too. Bindable. */
	columnFilters?: ColumnFiltersState;
	/** Rows per page. Leave unset to show every row. */
	pageSize?: number;
	/**
	 * Manual (server-side) pagination: the page owns the page state, the table shows `data` as
	 * the current page, and paging reports through `onPaginationChange`. `pageSize` is ignored.
	 */
	pagination?: PaginationState;
	/** Called with the next page state when the user pages. A plain callback, so it survives a props spread. */
	onPaginationChange?: (_next: PaginationState) => void;
	/** Rows across every page, for manual pagination. The pager uses it for the range and page count. */
	rowCount?: number;
	/** Show the pager under a paginated table (one with `pageSize` or `pagination`). Defaults to false. */
	pager?: boolean;
	/** A page is loading behind the current rows; the pager is disabled meanwhile */
	isFetching?: boolean;
	enableColumnResizing?: boolean;
	columnResizeMode?: ColumnResizeMode;
	/** Stripe alternate body rows. Turn off when rows are grouped by spanned cells. */
	striped?: boolean;
	/** Screen-reader caption naming the table */
	caption?: string;
	containerClass?: string;
	tableClass?: string;
	headerClass?: string;
	cellClass?: string;
	footerClass?: string;
	/** the message to display when the table has no data */
	emptyMessage?: string;
	isLoading?: boolean;
	isError?: boolean;
	problem?: Problem | null;
	/** Rendered above the table with the table instance, e.g. a TableSearch */
	above?: Snippet<[AppTable<TData>]>;
	/** Rendered below the table (above the pager) with the table instance */
	below?: Snippet<[AppTable<TData>]>;
};

