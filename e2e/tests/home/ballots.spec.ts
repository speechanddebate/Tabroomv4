import type { Page } from '@playwright/test';
import { test, expect, type TestPerson } from '../fixtures.js';
import factories from '../../../indexcards/tests/factories/index.js';

const HOUR = 60 * 60 * 1000;

// An unscored LD prelim judged by the person, AFF1 against NEG2, an hour from now in a timeslot
// that runs from an hour ago to two hours out, at a tournament running this week. The round's
// publication is the variable under test; the event, round settings, room, and ballot flags
// can be changed for the other cases.
const createJudgeRound = async (person: TestPerson, round: { published: number, settings?: Record<string, string> }, opts: {
	event?: { type?: string, abbr?: string, settings?: Record<string, string> },
	room?: { name: string, notes?: string },
	ballot?: { chair?: number, audit?: number },
} = {}) => {
	const tourn = await factories.tourn.create({
		name: `Home Ballot Classic ${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
		tz: 'America/Chicago',
		end: new Date(Date.now() + 7 * 24 * HOUR),
	});
	const category = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({
		tourn: tourn.id,
		category: category.id,
		type: opts.event?.type ?? 'debate',
		abbr: opts.event?.abbr ?? 'LD',
		settings: { online_ballots: '1', ...opts.event?.settings },
	});
	const timeslot = await factories.timeslot.create({ tourn: tourn.id, start: new Date(Date.now() - HOUR), end: new Date(Date.now() + 2 * HOUR) });
	const protocol = await factories.protocol.create({ tourn: tourn.id, tiebreaks: ['winloss', 'points'] });
	const created = await factories.round.create({
		event: event.id,
		timeslot: timeslot.id,
		protocol: protocol.id,
		type: 'prelim',
		name: 1,
		start_time: new Date(Date.now() + HOUR),
		...round,
	});
	const room = opts.room ? await factories.room.create(opts.room) : undefined;
	const panel = await factories.panel.create({ round: created.id, room: room?.id });
	const judge = await factories.judge.create({ person: person.id, category: category.id });

	const aff = await factories.entry.create({ event: event.id, code: 'AFF1' });
	const neg = await factories.entry.create({ event: event.id, code: 'NEG2' });
	await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: aff.id, side: 1, ...opts.ballot });
	await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: neg.id, side: 2, ...opts.ballot });

	return { tournName: tourn.name!, judge: judge.id, panel: panel.id };
};

const dueFor = (page: Page, tournName: string) => page.getByRole('article', { name: tournName }).getByRole('group', { name: `Due for ${tournName}` });

test.describe('ballots on the user home', () => {
	test('shows a published round\'s ballot as a task that opens the ballot', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 1 });

		await login(person);
		await page.goto('/user/home');

		const tasks = dueFor(page, ballot.tournName);
		await expect(tasks).toContainText(/Round 1 LD starts at/);
		await expect(tasks).toContainText('Aff AFF1 vs. Neg NEG2');

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

		const tasks = dueFor(page, ballot.tournName);
		await expect(tasks).toContainText(/Round 1 LD starts at/);
		await expect(tasks.getByRole('link', { name: 'Start round' })).toBeVisible();
	});

	test('shows the room, its notes when the round includes them, and the sides', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 1, settings: { include_room_notes: '1' } }, {
			room: { name: 'Room 204', notes: 'Back of the gym, use the side door' },
		});

		await login(person);
		await page.goto('/user/home');

		const tasks = dueFor(page, ballot.tournName);
		await expect(tasks).toContainText('Room 204');
		await expect(tasks).toContainText('Aff AFF1 vs. Neg NEG2');
		await expect(tasks).toContainText('Room notes: Back of the gym, use the side door');
	});

	test('shows a paper ballot\'s round with no ballot button when the event has no online ballots', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 1 }, { event: { settings: { online_ballots: '0' } } });

		await login(person);
		await page.goto('/user/home');

		const tasks = dueFor(page, ballot.tournName);
		await expect(tasks).toContainText(/Round 1 LD starts at/);
		await expect(tasks).toContainText('Paper ballot');
		await expect(tasks.getByRole('link', { name: 'Start round' })).toHaveCount(0);
	});

	test('keeps a congress chair\'s audited session open as presiding until the round ends', async ({ page, person, login }) => {
		const ballot = await createJudgeRound(person, { published: 1 }, { event: { type: 'congress', abbr: 'CON' }, ballot: { chair: 1, audit: 1 } });

		await login(person);
		await page.goto('/user/home');

		const tasks = dueFor(page, ballot.tournName);
		await expect(tasks).toContainText(/Session 1 CON: presiding until/);
		await expect(tasks.getByRole('link', { name: 'Session info' })).toBeVisible();
	});
});
