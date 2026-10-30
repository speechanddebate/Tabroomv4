import type { PageLoad } from './$types';
import { prefetchUserNotifyPushQuery, prefetchUserSessionsQuery } from '$indexcards';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await Promise.all([
		prefetchUserNotifyPushQuery(
			queryClient,
			{ fetcher: fetch }
		),
		prefetchUserSessionsQuery(
			queryClient,
			{ fetcher: fetch }
		),
	]);
};
