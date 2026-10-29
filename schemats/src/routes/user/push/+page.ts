import type { PageLoad } from './$types';
import { prefetchUserPushQuery, prefetchUserSessionsQuery } from '$indexcards';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await Promise.all([
		prefetchUserPushQuery(
			queryClient,
			{ fetcher: fetch }
		),
		prefetchUserSessionsQuery(
			queryClient,
			{ fetcher: fetch }
		),
	]);
};
