import { requireDevPages } from '#lib/helpers/devPages.server.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	requireDevPages();
};
