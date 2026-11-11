import { requireSiteAdmin } from '$lib/helpers/auth.server';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	requireSiteAdmin();
};
