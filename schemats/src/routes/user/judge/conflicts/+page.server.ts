import { error } from '@sveltejs/kit';
import { requireDevPages } from '$lib/helpers/devPages.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	requireDevPages();

	const judgeId = Number(url.searchParams.get('judge'));
	if (!Number.isInteger(judgeId) || judgeId <= 0) {
		error(404);
	}

	return { judgeId };
};
