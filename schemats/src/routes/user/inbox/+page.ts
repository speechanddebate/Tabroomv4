import type { PageLoad } from './$types';
import { prefetchUserInboxQuery } from '$indexcards';
import { DEFAULT_PAGE_SIZE } from '$lib/helpers/paging.svelte';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await prefetchUserInboxQuery(
		queryClient,
		{ limit: DEFAULT_PAGE_SIZE, offset: 0 },
		{ fetcher: fetch }
	);
};