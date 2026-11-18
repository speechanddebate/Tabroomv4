import type { Page } from '@playwright/test';
import { test, expect, API_URL } from '../fixtures.js';
import { db } from '../../../indexcards/api/data/database.js';
import personRepo from '../../../indexcards/api/repos/personRepo.js';

const NEW_PASSWORD = 'a fresh passphrase';

const changePassword = async (page: Page, current: string) => {
	const form = page.getByTestId('password-form');
	await form.getByRole('textbox', { name: 'Current password', exact: true }).fill(current);
	await form.getByRole('textbox', { name: 'New password', exact: true }).fill(NEW_PASSWORD);
	await form.getByRole('textbox', { name: 'Repeat new password', exact: true }).fill(NEW_PASSWORD);
	await form.getByRole('button', { name: 'Change password' }).click();
	await expect(page.getByText('Your password is changed, and you\'re logged out everywhere else')).toBeVisible();
};

test.describe('profile password', () => {
	test('a change in one browser logs the other out, and only the new password logs in', async ({ page, otherPage, person, login, request }) => {
		await login(person);
		await login(person, otherPage);

		await page.goto('/user/profile');
		await changePassword(page, person.password);
		await expect(page.getByTestId('sessions').getByRole('button', { name: /^End session on/ })).toHaveCount(0);

		await otherPage.goto('/user/profile');
		await expect(otherPage).toHaveURL('/user/login?redirect=%2Fuser%2Fprofile&reason=auth');

		// The request fixture holds no session cookie, so a login post needs no CSRF origin
		const old = await request.post(`${API_URL}/v1/auth/login`, { data: { username: person.email, password: person.password } });
		expect(old.status(), 'login with the old password').toBe(401);
		const changed = await request.post(`${API_URL}/v1/auth/login`, { data: { username: person.email, password: NEW_PASSWORD } });
		expect(changed.status(), 'login with the new password').toBe(200);
	});

	test('a required change shows only the password form, then the full profile', async ({ page, person, login }) => {
		await personRepo.updatePerson(db, person.id, { settings: { force_password_change: 1 } });
		await login(person);

		await page.goto('/user/profile');
		await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'First name' })).toHaveCount(0);

		await changePassword(page, person.password);

		await expect(page.getByRole('textbox', { name: 'First name' })).toBeVisible();
		await expect(page.getByTestId('forced-password-change')).toHaveCount(0);
	});
});
