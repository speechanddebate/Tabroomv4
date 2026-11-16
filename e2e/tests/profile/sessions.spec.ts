import { test, expect } from '../fixtures.js';

test.describe('profile sessions', () => {
	test('ending a session from another browser logs that browser out', async ({ page, otherPage, person, login }) => {
		await login(person);
		await login(person, otherPage);

		await page.goto('/user/profile');
		const sessions = page.getByTestId('sessions');
		await expect(sessions.getByText('This browser')).toBeVisible();
		const end = sessions.getByRole('button', { name: /^End session on/ });
		await expect(end).toHaveCount(1);

		await end.click();
		await expect(end).toHaveCount(0);

		await otherPage.goto('/user/profile');
		await expect(otherPage).toHaveURL('/user/login?redirect=%2Fuser%2Fprofile&reason=auth');
	});
});
