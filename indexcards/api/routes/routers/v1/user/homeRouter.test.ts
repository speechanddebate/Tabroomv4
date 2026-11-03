import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { createHomeWindow } from '../../../../../tests/homeWindow.js';
import { countQueries } from '../../../../../tests/queryCounter.js';
import { db } from '../../../../data/database.js';
import { saveSettings } from '../../../../repos/utils/index.js';
import { HomeResponseSchema } from '@tabroom/types';

type Tourn = Awaited<ReturnType<typeof factories.tourn.createFull>>;

let personId: number;
let userkey: string;
beforeEach(async () => {
	({ id: personId } = await factories.person.create());
	({ userkey } = await factories.session.create({ person: personId }));
});

const home = (key: string, query: Record<string, string> = {}) => request(server)
	.get('/v1/user/home')
	.query(query)
	.set('Accept', 'application/json')
	.asPerson(key)
	.expect('Content-Type', /json/)
	.expect(200);

// put the person at a tourn in each role
const judgeAt = (person: number, tourn: Tourn) => factories.person.createJudge({ person, Judge: { category: tourn.Category.id } });
const competeAt = async (person: number, tourn: Tourn) => {
	const Student = await factories.student.create({ person });
	return factories.entry.create({ event: tourn.Event.id, students: [Student.id] });
};
const coachAt = async (person: number, tourn: Tourn, tag = 'chapter') => {
	const Chapter = await factories.chapter.create();
	await factories.permission.create({ person, chapter: Chapter.id, tag });
	return factories.school.create({ tourn: tourn.Tourn.id, chapter: Chapter.id });
};
const tabAt = (person: number, tourn: Tourn) => factories.permission.create({ person, tourn: tourn.Tourn.id, tag: 'tabber' });

describe('GET /user/home', () => {
	it('requires a logged in person', async () => {
		const res = await request(server).get('/v1/user/home').set('Accept', 'application/json').expect(401);
		expect(res).toBeProblemResponse(401);
	});

	it('returns the server time, quiet alerts, and no cards for an account with no roles', async () => {
		const before = Date.now();
		const res = await home(userkey);

		expect(res.body).toMatchSchema(HomeResponseSchema);
		expect(new Date(res.body.now).getTime()).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
		expect(res.body.Alerts).toEqual({ paradigmReview: null, emailUnconfirmed: false, tzMissing: false });
		expect(res.body.Tourns).toEqual([]);
	});

	it('shows tournaments running, upcoming, or ended within 7 days, and only running ones with current', async () => {
		const window = await createHomeWindow();
		for (const tourn of Object.values(window)) await judgeAt(personId, tourn);

		const full = await home(userkey);
		expect(full.body).toMatchSchema(HomeResponseSchema);
		expect(full.body.Tourns.map((tourn: { id: number }) => tourn.id)).toEqual([
			window.endedRecently.Tourn.id,
			window.running.Tourn.id,
			window.upcoming.Tourn.id,
		]);

		const poll = await home(userkey, { current: 'true' });
		expect(poll.body).toMatchSchema(HomeResponseSchema);
		expect(poll.body.Tourns.map((tourn: { id: number }) => tourn.id)).toEqual([window.running.Tourn.id]);
	});

	it('names each role the person holds at a tourn and leaves the sections empty for now', async () => {
		const judging = await factories.tourn.createFull();
		const competing = await factories.tourn.createFull();
		const coaching = await factories.tourn.createFull();
		const tabbing = await factories.tourn.createFull();
		const everything = await factories.tourn.createFull({ name: 'Everything Open' });
		await judgeAt(personId, judging);
		await competeAt(personId, competing);
		await coachAt(personId, coaching);
		await tabAt(personId, tabbing);
		await judgeAt(personId, everything);
		await competeAt(personId, everything);
		await coachAt(personId, everything, 'prefs');
		await tabAt(personId, everything);
		// a tourn the person has no role at, and another person's roles at the judging tourn
		await factories.tourn.createFull();
		const Other = await factories.person.create();
		await judgeAt(Other.id, judging);
		await competeAt(Other.id, judging);

		const res = await home(userkey);

		expect(res.body).toMatchSchema(HomeResponseSchema);
		const roles = Object.fromEntries(res.body.Tourns.map((tourn: { id: number; roles: string[] }) => [tourn.id, tourn.roles]));
		expect(roles).toEqual({
			[judging.Tourn.id]: ['judge'],
			[competing.Tourn.id]: ['competitor'],
			[coaching.Tourn.id]: ['coach'],
			[tabbing.Tourn.id]: ['tab'],
			[everything.Tourn.id]: ['judge', 'competitor', 'coach', 'tab'],
		});
		const card = res.body.Tourns.find((tourn: { id: number }) => tourn.id === everything.Tourn.id);
		expect(card).toMatchObject({
			name: 'Everything Open',
			tz: everything.Tourn.tz,
			webname: everything.Tourn.webname,
			start: everything.Tourn.start?.toISOString(),
			end: everything.Tourn.end?.toISOString(),
			online: false,
			LiveDocs: [],
			OnlineRooms: [],
			Judges: [],
			Entries: [],
			Schools: [],
			Tab: null,
		});
	});

	it('marks a tourn online when an event runs online, and lists the live docs of the categories the person is in', async () => {
		const online = await factories.tourn.createFull({ Event: { settings: { online_mode: 'sync' } } });
		await saveSettings({ db, table: 'category', settings: { livedoc_url: 'https://docs.example.com/ld', livedoc_caption: 'Schedule' }, ownerId: online.Category.id });
		await judgeAt(personId, online);
		const offline = await factories.tourn.createFull({ Event: { settings: { online_mode: 'none' } } });
		await competeAt(personId, offline);
		// a live doc in a category the person is not in
		const other = await factories.category.create({ tourn: online.Tourn.id, settings: { livedoc_url: 'https://docs.example.com/other' } });

		const res = await home(userkey);

		expect(res.body).toMatchSchema(HomeResponseSchema);
		const cards = Object.fromEntries(res.body.Tourns.map((tourn: { id: number }) => [tourn.id, tourn]));
		expect(cards[online.Tourn.id]).toMatchObject({
			online: true,
			LiveDocs: [{ category: online.Category.id, Category: { name: online.Category.name, abbr: online.Category.abbr }, url: 'https://docs.example.com/ld', caption: 'Schedule' }],
		});
		expect(cards[offline.Tourn.id]).toMatchObject({ online: false, LiveDocs: [] });
		expect(JSON.stringify(res.body)).not.toContain(String(other.id));
	});

	it('raises the email and time zone alerts from the account', async () => {
		const Person = await factories.person.create({ tz: null });
		await saveSettings({ db, table: 'person', settings: { email_unconfirmed: 1 }, ownerId: Person.id });
		const { userkey: key } = await factories.session.create({ person: Person.id });
		// a just-finished tourn alone does not need a time zone; an upcoming one in any role does
		const finished = await factories.tourn.createFull({ start: new Date(Date.now() - 3 * 86400000), end: new Date(Date.now() - 2 * 86400000) });
		await competeAt(Person.id, finished);

		const finishedOnly = await home(key);
		expect(finishedOnly.body.Alerts).toEqual({ paradigmReview: null, emailUnconfirmed: true, tzMissing: false });

		const upcoming = await factories.tourn.createFull({ start: new Date(Date.now() + 3 * 86400000), end: new Date(Date.now() + 5 * 86400000) });
		await judgeAt(Person.id, upcoming);

		const withUpcoming = await home(key);
		expect(withUpcoming.body.Alerts).toEqual({ paradigmReview: null, emailUnconfirmed: true, tzMissing: true });
	});

	it("returns the impersonated person's tournaments while su'd", async () => {
		const Admin = await factories.person.create({ site_admin: 1 });
		const Target = await factories.person.create();
		const { userkey: suKey } = await factories.session.create({ person: Target.id, su: Admin.id });
		const theirs = await factories.tourn.createFull();
		const mine = await factories.tourn.createFull();
		await judgeAt(Target.id, theirs);
		await judgeAt(Admin.id, mine);

		const res = await home(suKey);

		expect(res.body.Tourns.map((tourn: { id: number }) => tourn.id)).toEqual([theirs.Tourn.id]);
		expect(JSON.stringify(res.body)).not.toContain(Admin.email);
	});

	it('runs the same number of queries whatever the number of tourns and roles', async () => {
		const one = await factories.tourn.createFull();
		await judgeAt(personId, one);
		const { count: oneTourn, queries } = await countQueries(() => home(userkey));

		const Busy = await factories.person.create();
		const { userkey: busyKey } = await factories.session.create({ person: Busy.id });
		for (let i = 0; i < 3; i++) {
			const tourn = await factories.tourn.createFull();
			await judgeAt(Busy.id, tourn);
			await competeAt(Busy.id, tourn);
			await coachAt(Busy.id, tourn);
			await tabAt(Busy.id, tourn);
		}
		const { count: threeTourns } = await countQueries(() => home(busyKey));

		// the session lookup plus the home stages: tourns; judges, entries, schools, permissions, events, person, tabroom; categories
		expect(queries.filter((sql) => sql.startsWith('select'))).toHaveLength(10);
		expect(threeTourns).toBe(oneTourn);
	});
});
