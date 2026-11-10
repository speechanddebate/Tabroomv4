import { requireDevPages } from '$lib/helpers/devPages.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	requireDevPages();
};
