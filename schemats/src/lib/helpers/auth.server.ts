import { error, redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
/**
 *  Verifies that there is a valid session in the request. If not, redirects to the login page with a redirect query parameter.
 * @returns the session object if it exists, otherwise it will redirect to the login page.
 */
export function requireLogin() {
	const { locals, url } = getRequestEvent();

	if (!locals.Session) {
		const redirectTo = url.pathname + url.search;
		const params = new URLSearchParams({
			redirect: redirectTo,
			reason: 'auth',
		});

		redirect(303, `/user/login?${params}`);
	}

	return locals.Session;
}

/**
 * Verifies that the session belongs to a site admin. Without a session it redirects to the login page;
 * anyone else gets a 404, While su'd the
 * session's person is the one being impersonated, so an admin su'd as a non-admin is turned away too.
 * @returns the session object
 */
export function requireSiteAdmin() {
	const session = requireLogin();

	if (!session.Person.site_admin) {
		error(404);
	}

	return session;
}