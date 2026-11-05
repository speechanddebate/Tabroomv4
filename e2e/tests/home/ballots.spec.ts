import { test, expect, type TestPerson } from '../fixtures.js';
import factories from '../../../indexcards/tests/factories/index.js';

// An unscored LD prelim judged by the person, AFF1 against NEG2, an hour from now at a
// tournament running this week. The round's publication is the variable under test.
const createJudgeRound = async (person: TestPerson, round: { published: number, settings?: Record<string, string> }) => {
	const tourn = await factories.tourn.create({
		name: `Home Ballot Classic ${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
		tz: 'America/Chicago',
		end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
	});
	const category = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({ tourn: tourn.id, category: category.id, type: 'debate', abbr: 'LD', settings: { online_ballots: '1' } });
	const timeslot = await factories.timeslot.create({ tourn: tourn.id });
	const protocol = await factories.protocol.create({ tourn: tourn.id, tiebreaks: ['winloss', 'points'] });
	const created = await factories.round.create({
		event: event.id,
		timeslot: timeslot.id,
		protocol: protocol.id,
		type: 'prelim',
		name: 1,
		start_time: new Date(Date.now() + 60 * 60 * 1000),
		...round,
	});
	const panel = await factories.panel.create({ round: created.id });
	const judge = await factories.judge.create({ person: person.id, category: category.id });

	const aff = await factories.entry.create({ event: event.id, code: 'AFF1' });
	const neg = await factories.entry.create({ event: event.id, code: 'NEG2' });
	await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: aff.id, side: 1 });
	await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: neg.id, side: 2 });

	return { tournName: tourn.name!, judge: judge.id, panel: panel.id };
};

test.describe('ballots on the user home', () => {
	test('shows a published round\'s ballot as a task that opens the ballot', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 1 });

		await login(person);
		await page.goto('/user/home');

		const tasks = page.getByRole('article', { name: ballot.tournName }).getByRole('group', { name: `Due for ${ballot.tournName}` });
		await expect(tasks).toContainText(/Round 1 LD starts at/);
		await expect(tasks).toContainText('AFF1 vs. NEG2.');

		await tasks.getByRole('link', { name: 'Start round' }).click();
		await expect(page).toHaveURL(url => url.pathname === '/user/judge/ballot'
			&& url.searchParams.get('judgeId') === String(ballot.judge)
			&& url.searchParams.get('panelId') === String(ballot.panel));
	});

	test('keeps an unpublished round\'s ballot off the home page', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 0 });

		await login(person);
		await page.goto('/user/home');

		// The judge still sees the tournament, just not the round
		const card = page.getByRole('article', { name: ballot.tournName });
		await expect(card).toBeVisible();
		await expect(card).not.toContainText('Round 1 LD');
		await expect(card.getByRole('link', { name: 'Start round' })).toHaveCount(0);
	});

	// Classic's "Publish ballots but not schematic"
	test('shows an unpublished round\'s ballot once it is released to judges', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 0, settings: { judges_ballots_visible: '1' } });

		await login(person);
		await page.goto('/user/home');

		const tasks = page.getByRole('article', { name: ballot.tournName }).getByRole('group', { name: `Due for ${ballot.tournName}` });
		await expect(tasks).toContainText(/Round 1 LD starts at/);
		await expect(tasks.getByRole('link', { name: 'Start round' })).toBeVisible();
	});
});
