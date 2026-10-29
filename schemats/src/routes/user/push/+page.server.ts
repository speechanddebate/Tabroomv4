import { requireDevPages } from '$lib/helpers/devPages.server';
import type { PageServerLoad } from './$types';

// This page is a developer tool for testing push registration. Its browser push logic lives in
// $lib/helpers/webpush so it can move to the real UI when this page is deleted.
export const load: PageServerLoad = () => {
	requireDevPages();
};
