import type { PageLoad } from './$types';
import { prefetchUserProfileQuery } from '$indexcards';

// Like the profile page: a server-rendered input picks up the browser's restored value at hydration
export const ssr = false;

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await prefetchUserProfileQuery(queryClient, { fetcher: fetch, query: { meta: { persist: false } } });
};
