import type { PageLoad } from './$types';
import { prefetchRestEmailConfirmStatusQuery } from '#indexcards';

export const load: PageLoad = async ({ params, parent, fetch }) => {
	const { queryClient } = await parent();

	// A replaced link answers 404 and an old one 410, which the page shows; nothing here should throw
	await prefetchRestEmailConfirmStatusQuery(queryClient, params.token, { fetcher: fetch });

	return { token: params.token };
};
