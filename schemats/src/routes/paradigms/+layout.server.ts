import { requireLogin } from '#lib/helpers/auth.server.ts';
import type { ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = () => {
	requireLogin();
	return;
};
