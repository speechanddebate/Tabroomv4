import type { PageLoad } from './$types';
import { prefetchUserNotifyPushQuery, prefetchUserProfileQuery, prefetchUserSessionsQuery } from '#indexcards';

export const ssr = false;

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await Promise.all([
		prefetchUserProfileQuery(queryClient, { fetcher: fetch }),
		prefetchUserNotifyPushQuery(queryClient, { fetcher: fetch }),
		prefetchUserSessionsQuery(queryClient, { fetcher: fetch }),
	]);
};
