import { test, expect, API_URL, APP_ORIGIN, getAuthCookie } from '../fixtures.js';

// Cookie-authenticated mutations must come from a trusted Origin. Logout is the
// simplest one, and a rejected logout leaves the session intact.
const logout = `${API_URL}/v1/auth/logout`;

test.beforeEach(async ({ person, login }) => {
	await login(person);
});

test('rejects a mutation from an untrusted origin', async ({ page, context }) => {
	const res = await page.request.post(logout, {
		headers: { Origin: 'https://evil.example.com' },
	});

	expect(res.status()).toBe(403);
	expect(await getAuthCookie(context)).toBeDefined();
});

test('rejects a mutation without an origin', async ({ page, context }) => {
	const res = await page.request.post(logout);

	expect(res.status()).toBe(403);
	expect(await getAuthCookie(context)).toBeDefined();
});

test('allows a mutation from the app origin', async ({ page, context }) => {
	const res = await page.request.post(logout, {
		headers: { Origin: APP_ORIGIN },
	});

	expect(res.status()).toBe(204);
	expect(await getAuthCookie(context)).toBeUndefined();
});
