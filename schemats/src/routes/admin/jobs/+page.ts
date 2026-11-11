import type { PageLoad } from './$types';
import { prefetchAdminJobsQuery } from '$indexcards';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	// Kept out of the cache saved to localStorage, like the page's own query
	await prefetchAdminJobsQuery(queryClient, { fetcher: fetch, query: { meta: { persist: false } } });
};
