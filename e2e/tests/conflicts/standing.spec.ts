import type { Page } from '@playwright/test';
import { test, expect, type TestPerson } from '../fixtures.js';
import factories from '../../../indexcards/tests/factories/index.js';
import { db } from '../../../indexcards/api/data/database.js';
import { saveSettings } from '../../../indexcards/api/repos/utils/index.js';

const HOUR = 60 * 60 * 1000;

// The person judges LD at a tournament running this week whose category takes judge conflicts.
// Quinn Quill's student is there on Riverdale QQ, for a chapter named for the test so the
// school search finds only it.
const createWorld = async (person: TestPerson) => {
	const suffix = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
	const tourn = await factories.tourn.create({ name: `Standing Classic ${suffix}`, tz: 'America/Chicago', end: new Date(Date.now() + 7 * 24 * HOUR) });
	const category = await factories.category.create({ tourn: tourn.id });
	await saveSettings({ db, table: 'category', settings: { conflicts: 1 }, ownerId: category.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id, type: 'debate', abbr: 'LD' });
	const chapter = await factories.chapter.create({ name: `Riverdale ${suffix}`, city: 'Riverdale', state: 'NY' });
	const riverdale = await factories.school.create({ tourn: tourn.id, name: 'Riverdale', chapter: chapter.id });
	const judge = await factories.judge.create({ person: person.id, category: category.id });
	const quinn = await factories.person.create({ first: 'Quinn', last: `Quill${suffix}` });
	const student = await factories.student.create({ person: quinn.id, first: 'Quinn', last: 'Quill' });
	await factories.entry.create({ event: event.id, school: riverdale.id, code: 'Riverdale QQ', name: 'Riverdale QQ', students: [student.id] });
	return { tourn, judge: judge.id, chapter, quinn };
};

const list = (page: Page) => page.getByRole('table', { name: 'Your standing conflicts' });
const marked = (page: Page) => page.getByRole('table', { name: 'Your conflicts at this tournament' });

test.describe('standing conflicts', () => {
	test('adds a person from the sidebar page, which marks their entry on the judge sheet, and removes it again', async ({ page, person, login }) => {
		const world = await createWorld(person);

		await login(person);
		await page.goto('/user/judge/history');
		await page.getByRole('link', { name: 'Standing Conflicts' }).click();
		await expect(page).toHaveURL(/\/user\/conflicts$/);
		await expect(page.getByRole('heading', { name: 'Standing conflicts', exact: true })).toBeVisible();

		await page.getByRole('textbox', { name: 'Last name' }).fill(world.quinn.last!);
		await page.getByRole('button', { name: 'Search' }).first().click();
		const found = page.getByRole('table', { name: 'People found' }).getByRole('row', { name: /Quinn Quill/ });
		await found.getByRole('button', { name: 'Conflict' }).click();

		await expect(list(page).getByRole('row', { name: /Quinn Quill/ })).toBeVisible();
		await expect(found).toContainText('Already a conflict');

		// the tournament sheet now carries the derived row, which the judge may remove
		await page.goto(`/user/judge/conflicts?judge=${world.judge}`);
		const derived = marked(page).getByRole('row', { name: /Riverdale QQ \(LD\)/ });
		await expect(derived).toBeVisible();
		await expect(derived.getByRole('button', { name: 'Remove' })).toBeVisible();

		await page.goto('/user/conflicts');
		await list(page).getByRole('row', { name: /Quinn Quill/ }).getByRole('button', { name: 'Remove' }).click();
		await expect(list(page).getByRole('row', { name: /Quinn Quill/ })).toHaveCount(0);

		await page.goto(`/user/judge/conflicts?judge=${world.judge}`);
		await expect(marked(page).getByRole('row', { name: /Riverdale QQ/ })).toHaveCount(0);
	});

	test('adds a school, which strikes the judge off its school', async ({ page, person, login }) => {
		const world = await createWorld(person);

		await login(person);
		await page.goto('/user/conflicts');
		await page.getByRole('textbox', { name: 'School name' }).fill(world.chapter.name);
		await page.getByRole('button', { name: 'Search' }).last().click();
		await page.getByRole('table', { name: 'Schools found' }).getByRole('row', { name: new RegExp(world.chapter.name) }).getByRole('button', { name: 'Conflict' }).click();
		await expect(list(page).getByRole('row', { name: new RegExp(`${world.chapter.name} \\(NY\\)`) })).toBeVisible();

		await page.goto(`/user/judge/conflicts?judge=${world.judge}`);
		await expect(marked(page).getByRole('row', { name: /^Riverdale/ })).toBeVisible();
		await expect(page.getByRole('table', { name: 'Entries in your category' }).getByRole('row', { name: /Riverdale QQ/ })).toContainText('Conflicted through Riverdale');
	});
});
