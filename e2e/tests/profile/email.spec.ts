import { sql } from 'kysely';
import { test, expect, API_URL, APP_ORIGIN } from '../fixtures.js';
import { db } from '../../../indexcards/api/data/database.js';
import personRepo from '../../../indexcards/api/repos/personRepo.js';

const confirmationOf = async (person: number) => {
	const rows = await db.selectFrom('person_setting').select(['tag', 'value'])
		.where('person', '=', person)
		.where('tag', 'in', ['email_unconfirmed', 'email_confirmation_key'])
		.execute();
	const settings = Object.fromEntries(rows.map(row => [row.tag, row.value]));
	return { unconfirmed: settings.email_unconfirmed ?? null, code: settings.email_confirmation_key ?? null };
};

/** Leaves the person waiting to confirm, holding this code, as classic and indexcards both store it */
const waitingWith = (person: number, code: string) =>
	personRepo.updatePerson(db, person, { no_email: 1, settings: { email_unconfirmed: 1, email_confirmation_key: code } });

test.describe('email confirmation', () => {
	test('a changed email gets a code, and entering it confirms the new address', async ({ page, otherPage, person, login }) => {
		const address = `changed-${person.id}-${Date.now()}@example.org`;
		await login(person);
		await page.goto('/user/profile');

		await page.getByRole('textbox', { name: 'Email' }).fill(address);
		// The password card has its own Current password field
		await page.getByTestId('profile-email').getByLabel(/Current password/).fill(person.password);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByText('Not confirmed yet.')).toBeVisible();

		await page.goto('/user/home');
		await expect(page.getByText('Confirm your email address')).toBeVisible();
		await page.getByRole('link', { name: 'Confirm your email' }).click();
		await expect(page).toHaveURL('/user/profile/confirm');

		const { code } = await confirmationOf(person.id);
		await page.getByRole('textbox', { name: /Confirmation code/ }).fill(code!.toLowerCase());
		await page.getByRole('button', { name: 'Confirm', exact: true }).click();

		await expect(page).toHaveURL('/user/home');
		await expect(page.getByText('Confirm your email address')).toHaveCount(0);
		expect(await confirmationOf(person.id)).toEqual({ unconfirmed: null, code: null });
		// A fresh browser: this one holds a session cookie, which makes a login post need the CSRF origin
		const relogin = await otherPage.request.post(`${API_URL}/v1/auth/login`, { data: { username: address, password: person.password } });
		expect(relogin.status(), 'login with the new address').toBe(200);
	});

	test('an expired code is replaced on arrival, and only the new one works', async ({ page, person, login }) => {
		await waitingWith(person.id, 'HXK3QY');
		await db.updateTable('person_setting')
			.set({ timestamp: sql<Date>`NOW() - INTERVAL 8 DAY` })
			.where('person', '=', person.id)
			.where('tag', '=', 'email_confirmation_key')
			.execute();
		await login(person);

		await page.goto('/user/profile/confirm');
		await expect(page.getByText(/Your last code had expired, so we sent a new one/)).toBeVisible();
		await expect.poll(async () => (await confirmationOf(person.id)).code).not.toBe('HXK3QY');

		const codeField = page.getByRole('textbox', { name: /Confirmation code/ });
		await codeField.fill('HXK3QY');
		await page.getByRole('button', { name: 'Confirm', exact: true }).click();
		await expect(page.getByText(/That code isn't right/)).toBeVisible();

		await codeField.fill((await confirmationOf(person.id)).code!);
		await page.getByRole('button', { name: 'Confirm', exact: true }).click();
		await expect(page).toHaveURL('/user/home');
	});

	test('the emailed link confirms in a browser with no login, but only on a press', async ({ page, otherPage, person, login }) => {
		await waitingWith(person.id, 'HXK3QY');
		await login(person);
		const resend = await page.request.post(`${API_URL}/v1/user/profile/email/resend`, { headers: { Origin: APP_ORIGIN } });
		expect(resend.status()).toBe(202);

		const message = await db.selectFrom('message').select('body')
			.where('person', '=', person.id)
			.orderBy('id', 'desc')
			.executeTakeFirstOrThrow();
		// The token after /confirm-email/ in the button's href, e.g. https://e2e.tabroom.test/confirm-email/eyJhbGci.eyJzdWIi.oT98vQOW
		const token = message.body!.match(/\/confirm-email\/([\w.-]+)/)![1];

		await otherPage.goto(`/confirm-email/${token}`);
		await expect(otherPage.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
		expect((await confirmationOf(person.id)).unconfirmed, 'opening the link confirms nothing').toBe('1');

		await otherPage.getByRole('button', { name: 'Confirm my email address' }).click();
		await expect(otherPage.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible();
		expect(await confirmationOf(person.id)).toEqual({ unconfirmed: null, code: null });
	});
});
