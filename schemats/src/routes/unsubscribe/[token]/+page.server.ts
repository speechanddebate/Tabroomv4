import { requireDevPages } from '$lib/helpers/devPages.server';
import type { PageServerLoad } from './$types';

// Public: the token in the URL is the only credential. Gated as a dev page until
// schemats serves production, which is also when notify email can start linking here
export const load: PageServerLoad = () => {
	requireDevPages();
};
