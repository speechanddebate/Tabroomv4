import type { PageLoad } from './$types';
import { prefetchRestNotifyEmailUnsubscribeStatusQuery } from '$indexcards';

export const load: PageLoad = async ({ params, parent, fetch }) => {
	const { queryClient } = await parent();

	// A bad token answers 404, which the page shows; nothing here should throw
	await prefetchRestNotifyEmailUnsubscribeStatusQuery(queryClient, params.token, { fetcher: fetch });

	return { token: params.token };
};
