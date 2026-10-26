import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prefetchUserJudgesHistoryTournQuery } from '$indexcards';

export const load: PageLoad = async ({ params, parent, fetch }) => {
	const tournId = Number(params.tournId);

	if (!Number.isInteger(tournId) || tournId <= 0) {
		throw error(404);
	}

	const { queryClient } = await parent();

	await prefetchUserJudgesHistoryTournQuery(
		queryClient,
		tournId,
		{ fetcher: fetch }
	);
};
