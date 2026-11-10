import type { Page } from '@playwright/test';
import { test, expect, type TestPerson } from '../fixtures.js';
import factories from '../../../indexcards/tests/factories/index.js';
import { db } from '../../../indexcards/api/data/database.js';
import { saveSettings } from '../../../indexcards/api/repos/utils/index.js';

const HOUR = 60 * 60 * 1000;

// The person judges LD for Lincoln at a tournament running this week. Westlake BB (Ana Adams),
// Westlake DD, and Riverdale CC are the other schools' entries; the coach has already marked
// all of Riverdale. Whether the category takes conflicts from judges is the variable.
const createSheet = async (person: TestPerson, opts: { conflicts?: boolean, marked?: boolean } = {}) => {
	const tourn = await factories.tourn.create({
		name: `Conflict Classic ${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
		tz: 'America/Chicago',
		end: new Date(Date.now() + 7 * 24 * HOUR),
	});
	const category = await factories.category.create({ tourn: tourn.id });
	if (opts.conflicts ?? true) await saveSettings({ db, table: 'category', settings: { conflicts: 1 }, ownerId: category.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id, type: 'debate', abbr: 'LD' });
	const lincoln = await factories.school.create({ tourn: tourn.id, name: 'Lincoln' });
	const westlake = await factories.school.create({ tourn: tourn.id, name: 'Westlake' });
	const riverdale = await factories.school.create({ tourn: tourn.id, name: 'Riverdale' });
	const judge = await factories.judge.create({ person: person.id, category: category.id, school: lincoln.id, code: 'J7' });

	const ana = await factories.student.create({ first: 'Ana', middle: null, last: 'Adams' });
	await factories.entry.create({ event: event.id, school: lincoln.id, code: 'Lincoln AA', name: 'Lincoln AA' });
	const westlakeBB = await factories.entry.create({ event: event.id, school: westlake.id, code: 'Westlake BB', name: 'Westlake BB', students: [ana.id] });
	await factories.entry.create({ event: event.id, school: westlake.id, code: 'Westlake DD', name: 'Westlake DD' });
	await factories.entry.create({ event: event.id, school: riverdale.id, code: 'Riverdale CC', name: 'Riverdale CC' });

	const coach = await factories.person.create();
	await factories.strike.create({ judge: judge.id, tourn: tourn.id, type: 'school', school: riverdale.id, conflictee: 0, entered_by: coach.id });
	if (opts.marked) {
		await factories.strike.create({ judge: judge.id, tourn: tourn.id, type: 'entry', entry: westlakeBB.id, conflictee: 1, entered_by: person.id });
	}

	return { tournName: tourn.name!, judge: judge.id };
};

const card = (page: Page, tournName: string) => page.getByRole('article', { name: tournName });
const marked = (page: Page) => page.getByRole('table', { name: 'Your conflicts at this tournament' });
const entries = (page: Page) => page.getByRole('table', { name: 'Entries in your category' });

test.describe('a judge\'s conflict sheet', () => {
	test('opens from the home card, marks an entry, and shows it on the card', async ({ page, person, login }) => {
		const sheet = await createSheet(person);

		await login(person);
		await page.goto('/user/home');
		await card(page, sheet.tournName).getByRole('link', { name: 'Add conflicts' }).click();
		await expect(page).toHaveURL(url => url.pathname === '/user/judge/conflicts' && url.searchParams.get('judge') === String(sheet.judge));
		await expect(page.getByRole('heading', { name: `Conflicts at ${sheet.tournName}` })).toBeVisible();

		// the coach's row is listed but is not the judge's to remove
		const riverdale = marked(page).getByRole('row', { name: /Riverdale/ });
		await expect(riverdale).toContainText('Contact your coach to remove this conflict');

		await entries(page).getByRole('row', { name: /Westlake DD/ }).getByRole('button', { name: 'Conflict', exact: true }).click();

		await expect(marked(page).getByRole('row', { name: /Westlake DD \(LD\)/ })).toBeVisible();
		await expect(entries(page).getByRole('row', { name: /Westlake DD/ })).toContainText('Marked');

		await page.goto('/user/home');
		await expect(card(page, sheet.tournName)).toContainText('Westlake DD');
	});

	test('marks a whole school, which covers its entries', async ({ page, person, login }) => {
		const sheet = await createSheet(person);

		await login(person);
		await page.goto(`/user/judge/conflicts?judge=${sheet.judge}`);

		await entries(page).getByRole('row', { name: /Westlake BB/ }).getByRole('button', { name: 'Whole school' }).click();

		await expect(marked(page).getByRole('row', { name: /Westlake/ })).toBeVisible();
		await expect(entries(page).getByRole('row', { name: /Westlake BB/ })).toContainText('Conflicted through Westlake');
		await expect(entries(page).getByRole('row', { name: /Westlake DD/ })).toContainText('Conflicted through Westlake');
		await expect(entries(page).getByRole('row', { name: /Riverdale CC/ })).toContainText('Conflicted through Riverdale');
		await expect(entries(page).getByRole('row', { name: /Lincoln AA/ })).toContainText('Your school');
	});

	test('removes a conflict the judge entered, and only that', async ({ page, person, login }) => {
		const sheet = await createSheet(person, { marked: true });

		await login(person);
		await page.goto(`/user/judge/conflicts?judge=${sheet.judge}`);

		const westlake = marked(page).getByRole('row', { name: /Westlake BB \(LD\)/ });
		await expect(westlake).toBeVisible();
		await expect(marked(page).getByRole('row', { name: /Riverdale/ }).getByRole('button', { name: 'Remove' })).toHaveCount(0);

		await westlake.getByRole('button', { name: 'Remove' }).click();

		await expect(marked(page).getByRole('row', { name: /Westlake BB/ })).toHaveCount(0);
		await expect(marked(page).getByRole('row', { name: /Riverdale/ })).toBeVisible();
		await expect(entries(page).getByRole('row', { name: /Westlake BB/ }).getByRole('button', { name: 'Conflict', exact: true })).toBeVisible();
	});

	test('shows the judge\'s conflicts but nothing to mark when the category does not take them', async ({ page, person, login }) => {
		const sheet = await createSheet(person, { conflicts: false });

		await login(person);
		await page.goto('/user/home');
		// the card still offers the link, to the account-wide list
		await expect(card(page, sheet.tournName).getByRole('link', { name: 'Add conflicts' })).toHaveAttribute('href', '/user/conflicts');

		await page.goto(`/user/judge/conflicts?judge=${sheet.judge}`);
		await expect(marked(page).getByRole('row', { name: /Riverdale/ })).toBeVisible();
		await expect(page.getByText("This tournament doesn't take conflicts from judges")).toBeVisible();
		await expect(entries(page)).toHaveCount(0);
	});
});
