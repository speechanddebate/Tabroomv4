import type { PageLoad } from './$types';
import { prefetchRestJudgesConflictsQuery } from '$indexcards';

export const load: PageLoad = async ({ parent, fetch, data }) => {
	const { queryClient } = await parent();

	await prefetchRestJudgesConflictsQuery(queryClient, data.judgeId, { fetcher: fetch });

	return data;
};
