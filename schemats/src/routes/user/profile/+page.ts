import type { PageLoad } from './$types';
import { prefetchUserNotifyPushQuery, prefetchUserProfileQuery } from '$indexcards';

export const ssr = false;

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await Promise.all([
		prefetchUserProfileQuery(queryClient, { fetcher: fetch, query: { meta: { persist: false } } }),
		prefetchUserNotifyPushQuery(queryClient, { fetcher: fetch }),
	]);
};
