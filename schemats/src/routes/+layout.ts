import type { LayoutLoad } from './$types';
import { browser } from '$app/env';
import { QueryClient } from '@tanstack/svelte-query';

const makeQueryClient = () => new QueryClient({
	defaultOptions: {
		queries: {
			enabled   : browser,
			staleTime : 60 * 100,
		},
	},
});

// invalidateAll reruns this load on login, logout and su end. The browser keeps one
// client across reruns so the context provider and the persister share it; the
// server makes one per request so users never share a cache.
let browserQueryClient: QueryClient | undefined;

/** handles loading and attaching session data to the root layout, so it can be
 * accessed by all child routes. This should be in a load function as it needs
 * to be present before any page is rendered to avoid a flash of
 * unauthenticated content, and it needs to run on the server to access cookies
 * securely.
 */
export const load: LayoutLoad = async ({ data }) => {

	const queryClient = browser
		? (browserQueryClient ??= makeQueryClient())
		: makeQueryClient();

	return { queryClient, sessionData: data.sessionData };
};