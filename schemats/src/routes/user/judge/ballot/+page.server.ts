import { error } from '@sveltejs/kit';
import { requireDevPages } from '#lib/helpers/devPages.server.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	requireDevPages();

	const judgeId = Number(url.searchParams.get('judgeId'));
	const panelId = Number(url.searchParams.get('panelId'));

	if (!Number.isInteger(judgeId) || judgeId <= 0 || !Number.isInteger(panelId) || panelId <= 0) {
		error(404);
	}

	return { judgeId, panelId };
};
