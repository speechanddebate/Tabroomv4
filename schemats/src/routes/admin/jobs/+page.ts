import type { PageLoad } from './$types';
import { prefetchAdminJobsQuery } from '#indexcards';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await prefetchAdminJobsQuery(queryClient, { fetcher: fetch });
};
