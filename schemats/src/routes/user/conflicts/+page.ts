import type { PageLoad } from './$types';
import { prefetchUserConflictsQuery } from '$indexcards';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await prefetchUserConflictsQuery(queryClient, { fetcher: fetch });
};
