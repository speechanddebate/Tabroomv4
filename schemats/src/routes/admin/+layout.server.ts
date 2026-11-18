import { requireSiteAdmin } from '#lib/helpers/auth.server.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	requireSiteAdmin();
};
