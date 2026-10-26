import { keepPreviousData } from '@tanstack/svelte-query';
import type { PaginationState } from '@tanstack/svelte-table';

export const DEFAULT_PAGE_SIZE = 50;

/**
 * The page state shared by an orval list hook and the QueryTable that pages it:
 *
 *   const paging = createPaging(50);
 *   const query = createUserJudgesHistory(paging.params, paging.options);
 *   <QueryTable {columns} {paging} {query} />
 *
 * The table changes `pagination` as the user pages; the hook's params getter reads it, so
 * the hook refetches with that page's limit and offset.
 */
export class Paging {
	pagination = $state<PaginationState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });

	constructor(pageSize = DEFAULT_PAGE_SIZE) {
		this.pagination = { pageIndex: 0, pageSize };
	}

	/** The current page's limit and offset, for the hook's params getter */
	params = () => ({
		limit: this.pagination.pageSize,
		offset: this.pagination.pageIndex * this.pagination.pageSize,
	});

	/** Query options that keep the current page's rows on screen while the next page loads */
	options = () => ({ query: { placeholderData: keepPreviousData } });
}

export const createPaging = (pageSize?: number) => new Paging(pageSize);
