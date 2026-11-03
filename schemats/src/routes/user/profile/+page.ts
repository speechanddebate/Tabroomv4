import type { PageLoad } from './$types';
import { prefetchUserNotifyPushQuery } from '$indexcards';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await prefetchUserNotifyPushQuery(queryClient, { fetcher: fetch });
};
