import { test, expect, getAuthCookie, loginThroughForm } from '../fixtures.js';

test('user can log in and log out', async ({ page, context, person }) => {
	await page.goto('/user/login');
	await loginThroughForm(page, person);
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: person.email })).toBeVisible();
	expect(await getAuthCookie(context)).toBeDefined();

	await page.getByRole('button', { name: 'open user dropdown' }).click();
	await page.getByRole('button', { name: 'Logout' }).click();

	await expect(page.getByRole('link', { name: 'LOGIN' })).toBeVisible();
	await expect(page.getByRole('link', { name: person.email })).toBeHidden();
	await expect.poll(() => getAuthCookie(context)).toBeUndefined();
});

test('rejects a wrong password', async ({ page, context, person }) => {
	await page.goto('/user/login');
	await loginThroughForm(page, person, 'not-the-password');

	await expect(page.getByText('Invalid Credentials')).toBeVisible();
	await expect(page).toHaveURL('/user/login');
	expect(await getAuthCookie(context)).toBeUndefined();
});

test('redirects to login for a protected page, then back after login', async ({ page, person }) => {
	await page.goto('/user/home');

	await expect(page).toHaveURL('/user/login?redirect=%2Fuser%2Fhome&reason=auth');
	await expect(page.getByText('Authentication Required')).toBeVisible();

	await loginThroughForm(page, person);

	await expect(page).toHaveURL('/user/home');
	await expect(page.getByRole('link', { name: person.email })).toBeVisible();
});

test('session survives a full reload', async ({ page, person, login }) => {
	await login(person);

	await page.goto('/');
	await expect(page.getByRole('link', { name: person.email })).toBeVisible();

	// a reload is rendered server-side, so this proves the server sees the shared cookie
	await page.reload();
	await expect(page.getByRole('link', { name: person.email })).toBeVisible();
});

test('a logged-out session no longer grants access', async ({ page, context, person, login }) => {
	await login(person);
	const token = (await getAuthCookie(context))!;

	await page.goto('/user/home');
	await page.getByRole('button', { name: 'open user dropdown' }).click();
	await page.getByRole('button', { name: 'Logout' }).click();
	await expect.poll(() => getAuthCookie(context)).toBeUndefined();

	await expect(page).toHaveURL(/\/user\/login\?redirect=%2Fuser%2Fhome&reason=auth$/);
	// replay the old token to prove the session was deleted server-side, not just the cookie
	await context.addCookies([token]);
	// the redirect to login interrupts this navigation before it loads
	await page.goto('/user/home', { waitUntil: 'commit' });

	await expect(page).toHaveURL(/\/user\/login\?redirect=%2Fuser%2Fhome&reason=auth$/);
});
