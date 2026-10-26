import type { PageLoad } from './$types';
import { prefetchUserJudgesHistoryQuery } from '$indexcards';
import { PAGE_SIZE } from './pageSize';

export const load: PageLoad = async ({ parent, fetch }) => {
	const { queryClient } = await parent();

	await prefetchUserJudgesHistoryQuery(
		queryClient,
		{ limit: PAGE_SIZE, offset: 0 },
		{ fetcher: fetch }
	);
};
