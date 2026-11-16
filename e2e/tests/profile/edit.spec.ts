import { test, expect } from '../fixtures.js';
import { db } from '../../../indexcards/api/data/database.js';
import personRepo from '../../../indexcards/api/repos/personRepo.js';

test.describe('profile', () => {
	test('edits the name, phone, pronouns, country, state and time zone, and keeps them after a reload', async ({ page, person, login }) => {
		await personRepo.updatePerson(db, person.id, { country: 'US', state: 'IA', tz: 'America/Chicago', phone: null });
		// Phones are unique across accounts, so each run draws its own
		const phone = `${2 + Math.floor(Math.random() * 8)}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

		await login(person);
		await page.goto('/user/profile');
		await expect(page.getByText('All changes saved')).toBeVisible();

		await page.getByRole('textbox', { name: 'First name' }).fill('Mary-Jane');
		await page.getByRole('textbox', { name: 'Pronouns' }).fill('she/her');
		await page.getByRole('textbox', { name: 'Phone' }).fill(`+44 ${phone}`);
		await page.getByRole('combobox', { name: 'Country' }).selectOption('GB');
		await page.getByRole('combobox', { name: 'State' }).selectOption('EN');
		await page.getByRole('textbox', { name: 'Postal code' }).fill('SW1A 1AA');
		await page.getByRole('combobox', { name: 'Time zone' }).selectOption('Europe/London');
		await expect(page.getByText('7 unsaved changes')).toBeVisible();

		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByText('All changes saved')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Phone' })).toHaveValue(`44${phone}`);

		await page.reload();
		await expect(page.getByRole('textbox', { name: 'First name' })).toHaveValue('Mary-Jane');
		await expect(page.getByRole('textbox', { name: 'Pronouns' })).toHaveValue('she/her');
		await expect(page.getByRole('textbox', { name: 'Phone' })).toHaveValue(`44${phone}`);
		await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('GB');
		await expect(page.getByRole('combobox', { name: 'State' })).toHaveValue('EN');
		await expect(page.getByRole('textbox', { name: 'Postal code' })).toHaveValue('SW1A 1AA');
		await expect(page.getByRole('combobox', { name: 'Time zone' })).toHaveValue('Europe/London');

		const saved = await db.selectFrom('person').selectAll().where('id', '=', person.id).executeTakeFirstOrThrow();
		expect(saved).toMatchObject({ first: 'Mary-Jane', pronoun: 'she/her', phone: Number(`44${phone}`), country: 'GB', state: 'EN', postal: 'SW1A 1AA', tz: 'Europe/London' });
	});

	test('shows a field\'s problem under it and saves nothing', async ({ page, person, login }) => {
		await personRepo.updatePerson(db, person.id, { country: 'US', first: 'Before' });

		await login(person);
		await page.goto('/user/profile');
		await page.getByRole('textbox', { name: 'First name' }).fill('After');
		await page.getByRole('textbox', { name: 'ZIP code' }).fill('1234');
		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect(page.getByText('Use a 5-digit ZIP code, or ZIP+4')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'ZIP code' })).toHaveAttribute('aria-invalid', 'true');
		const saved = await db.selectFrom('person').select('first').where('id', '=', person.id).executeTakeFirstOrThrow();
		expect(saved.first).toBe('Before');
	});
});
