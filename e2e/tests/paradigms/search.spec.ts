import { test, expect } from '../fixtures.js';
import factories from '../../../indexcards/tests/factories/index.js';

// search strips everything but letters, digits and dashes, so keep the token alphanumeric
const uniqueToken = () => `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;

test('searches for a judge and views their paradigm', async ({ page, person, login }) => {
	const first = 'Paradigm';
	const last = `Judge${uniqueToken()}`;
	const name = `${first} ${last}`;
	const paradigmText = `Tabula rasa, ${uniqueToken()}`;

	// search only returns people who have judged and have a paradigm
	const { Person: judge } = await factories.person.createJudge({
		first,
		middle: null,
		last,
		settings: { paradigm: `<p>${paradigmText}</p>` },
	});

	await login(person);
	await page.goto('/paradigms');

	const search = page.getByRole('searchbox', { name: 'Search paradigms' });
	await search.fill(name);
	await search.press('Enter');

	await expect(page).toHaveURL(url => url.pathname === '/paradigms' && url.searchParams.get('search') === name);
	await expect(page.getByRole('heading', { name })).toBeVisible();

	await page.getByRole('link', { name: `View Paradigm for ${name}` }).click();

	await expect(page).toHaveURL(url => url.pathname === `/paradigms/${judge.id}` && url.searchParams.get('search') === name);
	// the sidebar results repeat the name as an h3, so match the details h2
	await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
	await expect(page.getByText(paradigmText)).toBeVisible();
});
