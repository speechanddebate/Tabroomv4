import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { createHomeWindow } from '../../../../../tests/homeWindow.js';
import { countQueries } from '../../../../../tests/queryCounter.js';
import { db } from '../../../../data/database.js';
import { saveSettings, type Settings } from '../../../../repos/utils/index.js';
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

	it('names each role the person holds at a tourn', async () => {
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
		await coachAt(personId, everything);
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
		});
		expect(card.Judges).toHaveLength(1);
		expect(card.Entries).toHaveLength(1);
		expect(card.Schools).toHaveLength(1);
		expect(card.Tab).toMatchObject({ tag: 'tabber' });
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

	describe('judge section', () => {
		const DAY = 86400000;

		it('fills the judge tab for a running tourn: commitment, pools, counts, strikes, questionnaires, open ballots, and fines', async () => {
			const tourn = await factories.tourn.createFull({ start: new Date(Date.now() - DAY), end: new Date(Date.now() + DAY), settings: { currency: '€' }, Event: { type: 'debate' } });
			const School = await factories.school.create({ tourn: tourn.Tourn.id, name: 'Lincoln' });
			const { Judge } = await factories.person.createJudge({ person: personId, Judge: { category: tourn.Category.id, school: School.id, code: 'J7', obligation: 3 } });
			const { Judge: Other } = await factories.person.createJudge({ Judge: { category: tourn.Category.id } });
			const shown = await factories.jpool.create({ category: tourn.Category.id, name: 'Friday', judges: [Judge.id, Other.id], settings: { registrant: 1 } });
			await factories.jpool.create({ category: tourn.Category.id, name: 'Standby', judges: [Judge.id], settings: { standby: 1, show_judges: 1 } });
			await factories.jpool.create({ category: tourn.Category.id, name: 'Hidden', judges: [Judge.id] });
			const quiz = await factories.quiz.create({ label: 'Ethics' });
			const poolQuiz = await factories.quiz.create({ label: 'Pool rules' });
			await saveSettings({ db, table: 'category', settings: { required_quizzes: [quiz.id] }, ownerId: tourn.Category.id });
			await saveSettings({ db, table: 'jpool', settings: { paradigm_quiz: poolQuiz.id }, ownerId: shown.id });
			await factories.personQuiz.create({ person: personId, quiz: quiz.id, completed: 1 });
			const strike = await factories.strike.create({ judge: Judge.id, tourn: tourn.Tourn.id, type: 'school', school: School.id, conflict: 1, registrant: 1 });
			await factories.strike.create({ judge: Judge.id, tourn: tourn.Tourn.id, type: 'school', school: School.id, conflict: 1, registrant: 0 });
			// an open panel, and an audited panel that counts as judged
			const open = await factories.panel.create({ round: tourn.Round.id });
			for (const side of [1, 2]) await factories.ballot.create({ panel: open.id, judge: Judge.id, entry: (await factories.entry.create({ event: tourn.Event.id })).id, side });
			const done = await factories.panel.create({ round: tourn.Round.id });
			for (const side of [1, 2]) await factories.ballot.create({ panel: done.id, judge: Judge.id, entry: (await factories.entry.create({ event: tourn.Event.id })).id, side, audit: 1 });
			const mine = await factories.fine.create({ tourn: tourn.Tourn.id, judge: Judge.id, school: School.id, amount: 25 });
			const personal = await factories.fine.create({ tourn: tourn.Tourn.id, person: personId, school: School.id });
			await factories.fine.create({ tourn: tourn.Tourn.id, judge: Other.id, school: School.id });

			const res = await home(userkey);

			expect(res.body).toMatchSchema(HomeResponseSchema);
			const [judge] = res.body.Tourns[0].Judges;
			expect(judge).toMatchObject({
				id: Judge.id,
				code: 'J7',
				obligation: 3,
				category: tourn.Category.id,
				Category: { id: tourn.Category.id, name: tourn.Category.name, abbr: tourn.Category.abbr },
				school: School.id,
				School: { id: School.id, name: 'Lincoln' },
				Jpools: [{ id: shown.id, name: 'Friday', site: null }],
				roundsJudged: 1,
				ballotsEntered: 2,
				ballotsOpen: null,
				feedbackUntil: tourn.Tourn.end?.toISOString(),
				Strikes: [{ id: strike.id, type: 'school', school: School.id, School: { name: 'Lincoln' }, entry: null, Entry: null }],
				Quizzes: [
					{ Quiz: { id: quiz.id, label: 'Ethics', approval: 0 }, requiredBy: tourn.Category.name, PersonQuiz: { completed: 1, approved_by: null, pending: 0 } },
					{ Quiz: { id: poolQuiz.id, label: 'Pool rules', approval: 0 }, requiredBy: 'Friday', PersonQuiz: null },
				],
			});
			expect(judge.CurrentBallots.map((ballot: { id: number }) => ballot.id)).toEqual([open.id]);
			expect(judge.CurrentBallots[0].Room).toEqual({ name: null, joinable: false, hybrid: false, mapUrl: null });
			expect(judge.Fines.map((fine: { id: number }) => fine.id).sort()).toEqual([mine.id, personal.id].sort());
			expect(judge.Fines.find((fine: { id: number }) => fine.id === mine.id)).toMatchObject({ amount: 25, currency: '€', judge: Judge.id, Judge: { first: Judge.first, last: Judge.last } });
		});

		it('gives each current ballot the room of its own section', async () => {
			const tourn = await factories.tourn.createFull({ start: new Date(Date.now() - DAY), end: new Date(Date.now() + DAY), Event: { type: 'debate' } });
			const { Judge } = await factories.person.createJudge({ person: personId, Judge: { category: tourn.Category.id } });
			const rooms = new Map<number, string>();
			for (const name of ['204', '205']) {
				const panel = await factories.panel.create({ round: tourn.Round.id, room: (await factories.room.create({ name })).id });
				await factories.ballot.create({ panel: panel.id, judge: Judge.id, entry: (await factories.entry.create({ event: tourn.Event.id })).id });
				rooms.set(panel.id, name);
			}

			const res = await home(userkey);

			expect(new Map(res.body.Tourns[0].Judges[0].CurrentBallots.map((ballot: { id: number; Room: { name: string } }) => [ballot.id, ballot.Room.name]))).toEqual(rooms);
		});

		it('tells an upcoming tourn when ballots open and leaves current ballots and feedback closed', async () => {
			const tourn = await factories.tourn.createFull({ start: new Date(Date.now() + 2 * DAY), end: new Date(Date.now() + 3 * DAY) });
			const { Judge } = await factories.person.createJudge({ person: personId, Judge: { category: tourn.Category.id } });
			const panel = await factories.panel.create({ round: tourn.Round.id });
			await factories.ballot.create({ panel: panel.id, judge: Judge.id, entry: (await factories.entry.create({ event: tourn.Event.id })).id });

			const res = await home(userkey);

			expect(res.body.Tourns[0].Judges[0]).toMatchObject({
				School: null,
				ballotsOpen: tourn.Tourn.start?.toISOString(),
				feedbackUntil: null,
				CurrentBallots: [],
				Jpools: [],
				Quizzes: [],
				Fines: [],
			});
		});
	});

	describe('competitor section', () => {
		const DAY = 86400000;
		type Levels = { published: number; post_primary?: number; post_secondary?: number };

		// a running debate tourn with the person's entry, an opponent, and a judge
		async function setup(overrides: { tourn?: Record<string, unknown>; event?: Record<string, unknown> } = {}) {
			const tourn = await factories.tourn.createFull({
				start: new Date(Date.now() - DAY),
				end: new Date(Date.now() + DAY),
				Event: { type: 'debate', settings: { flight_offset: 30, ...overrides.event } },
				...overrides.tourn,
			});
			const School = await factories.school.create({ tourn: tourn.Tourn.id });
			const Student = await factories.student.create({ person: personId });
			const Partner = await factories.student.create({ first: 'Pat', last: 'Partner' });
			const mine = await factories.entry.create({ event: tourn.Event.id, school: School.id, code: 'AB', name: 'Adams & Brown', students: [Student.id, Partner.id] });
			const opponent = await factories.entry.create({ event: tourn.Event.id, code: 'CD' });
			const { Judge } = await factories.person.createJudge({ Judge: { category: tourn.Category.id, first: 'Jo', last: 'Judge', code: 'J1' } });
			return { ...tourn, School, Partner, mine, opponent, Judge };
		}

		// a paired round at the given publish levels, with scored ballots. Round names are unique per event
		let roundName = 2;
		async function pair(t: Awaited<ReturnType<typeof setup>>, levels: Levels, opts: { audit?: number; settings?: Settings; type?: string; panel?: Settings } = {}) {
			const round = await factories.round.create({ event: t.Event.id, timeslot: t.Timeslot.id, name: roundName++, label: 'Round 2', type: opts.type ?? 'prelim', ...levels, settings: opts.settings });
			const Room = await factories.room.create({ name: '204', url: 'https://maps.test/204' });
			const panel = await factories.panel.create({ round: round.id, room: Room.id, letter: 'B', flight: 1, settings: opts.panel ?? { flip_status: 'done', flip_at: new Date('2026-03-01T10:00:00Z') } });
			const myBallot = await factories.ballot.create({ panel: panel.id, judge: t.Judge.id, entry: t.mine.id, side: 1, audit: opts.audit ?? 1 });
			await factories.ballot.create({ panel: panel.id, judge: t.Judge.id, entry: t.opponent.id, side: 2, audit: 1 });
			await factories.score.create({ ballot: myBallot.id, tag: 'winloss', value: 1 });
			await factories.score.create({ ballot: myBallot.id, tag: 'point', value: 28.5 });
			await factories.score.create({ ballot: myBallot.id, tag: 'rank', value: 1 });
			return { round, panel, Room };
		}

		const entryOf = (res: request.Response, tourn: number) => res.body.Tourns.find((card: { id: number }) => card.id === tourn).Entries[0];

		it('fills the competitor tab for a running tourn: the entry, teammates, prefs, and the round table', async () => {
			const t = await setup();
			await saveSettings({ db, table: 'category', settings: { prefs: 'tiered', strike_start: new Date('2026-03-01T08:00:00Z'), strike_end: new Date('2026-03-02T08:00:00Z') }, ownerId: t.Category.id });
			const { round, panel, Room } = await pair(t, { published: 1, post_primary: 2, post_secondary: 2 }, { settings: { strikes_published: 1, strikes_due: new Date('2026-03-01T12:00:00Z') } });

			const res = await home(userkey);

			expect(res.body).toMatchSchema(HomeResponseSchema);
			const entry = entryOf(res, t.Tourn.id);
			expect(entry).toMatchObject({
				id: t.mine.id,
				code: 'AB',
				name: 'Adams & Brown',
				active: 1,
				supp: false,
				event: t.Event.id,
				Event: { id: t.Event.id, name: t.Event.name, abbr: t.Event.abbr, type: 'debate' },
				school: t.School.id,
				Students: [{ id: t.Partner.id, first: 'Pat', last: 'Partner' }],
				Prefs: { type: 'tiered', start: '2026-03-01T08:00:00.000Z', end: '2026-03-02T08:00:00.000Z' },
			});
			expect(entry.Rounds).toEqual([{
				id: round.id,
				name: round.name,
				label: 'Round 2',
				type: round.type,
				published: 1,
				post_primary: 2,
				post_secondary: 2,
				post_feedback: round.post_feedback,
				start: t.Timeslot.start?.toISOString(),
				side: 1,
				speakerorder: 0,
				Panel: { id: panel.id, letter: 'B', flight: 1, bye: 0, flip_at: null, flip_status: null },
				Room: { name: '204', url: 'https://maps.test/204' },
				Opponents: [{ entry: t.opponent.id, code: 'CD' }],
				Judges: [{ id: t.Judge.id, first: 'Jo', last: 'Judge', code: 'J1' }],
				Scores: expect.arrayContaining([
					{ judge: t.Judge.id, tag: 'winloss', value: 1, student: null },
					{ judge: t.Judge.id, tag: 'point', value: 28.5, student: null },
					{ judge: t.Judge.id, tag: 'rank', value: 1, student: null },
				]),
				strikesDue: '2026-03-01T12:00:00.000Z',
			}]);
			expect(Room.id).toBeDefined();
		});

		it('shows each part of a round only at its publish level, and nothing of an unaudited panel', async () => {
			const t = await setup();
			await pair(t, { published: 2, post_primary: 2 });
			await pair(t, { published: 0, post_primary: 2 });
			await pair(t, { published: 0, post_primary: 0 });
			await pair(t, { published: 1, post_primary: 2, post_secondary: 2 }, { audit: 0 });
			await pair(t, { published: 1, post_primary: 1 });

			const res = await home(userkey);

			const rounds = entryOf(res, t.Tourn.id).Rounds.map((round: Record<string, unknown>) => ({
				published: round.published,
				room: round.Room !== null,
				opponents: (round.Opponents as unknown[]).length,
				judges: (round.Judges as unknown[]).length,
				scores: (round.Scores as unknown[]).length,
			}));
			expect(rounds).toEqual([
				{ published: 2, room: true, opponents: 1, judges: 0, scores: 0 },
				{ published: 0, room: false, opponents: 0, judges: 0, scores: 0 },
				{ published: 1, room: true, opponents: 1, judges: 1, scores: 0 },
				{ published: 1, room: true, opponents: 1, judges: 1, scores: 0 },
			]);
		});

		it('hides the side while a flip is pending or an elim is unflipped, and sends flip details only once released', async () => {
			const t = await setup();
			const flipAt = new Date('2026-03-01T10:00:00Z');
			const pendingReleased = await pair(t, { published: 1 }, { audit: 0, settings: { flip_published: 1 }, panel: { flip_status: 'winner', flip_at: flipAt } });
			const pendingUnreleased = await pair(t, { published: 1 }, { audit: 0, panel: { flip_status: 'winner', flip_at: flipAt } });
			const unflippedElim = await pair(t, { published: 1 }, { audit: 0, type: 'elim', panel: {} });
			const auditedElim = await pair(t, { published: 1 }, { type: 'elim', panel: {} });

			const rounds: { id: number; side: number | null; speakerorder: number | null; Panel: { flip_at: string | null; flip_status: string | null } }[] = entryOf(await home(userkey), t.Tourn.id).Rounds;
			const byRound = (round: { round: { id: number } }) => rounds.find((row) => row.id === round.round.id);

			expect(byRound(pendingReleased)).toMatchObject({ side: null, speakerorder: null, Panel: { flip_at: flipAt.toISOString(), flip_status: 'winner' } });
			expect(byRound(pendingUnreleased)).toMatchObject({ side: null, speakerorder: null, Panel: { flip_at: null, flip_status: null } });
			expect(byRound(unflippedElim)).toMatchObject({ side: null, speakerorder: null, Panel: { flip_at: null, flip_status: null } });
			expect(byRound(auditedElim)).toMatchObject({ side: 1, speakerorder: 0 });
		});

		it('hides codes and judge names when the tourn and event say so', async () => {
			const t = await setup({ tourn: { settings: { hide_codes: 1 } }, event: { anonymous_public: 1 } });
			await pair(t, { published: 1, post_primary: 2 });

			const entry = entryOf(await home(userkey), t.Tourn.id);

			expect(entry.code).toBeNull();
			expect(entry.Rounds[0].Opponents).toEqual([{ entry: t.opponent.id, code: null }]);
			expect(entry.Rounds[0].Judges).toEqual([{ id: t.Judge.id, first: null, last: null, code: 'J1' }]);
		});

		it('hides judge names at an ncfl tourn unless the event shows them on dashboards', async () => {
			const ncfl = await setup({ tourn: { settings: { ncfl: 1 } } });
			await pair(ncfl, { published: 1 });
			const optedOut = await setup({ tourn: { settings: { ncfl: 1 } }, event: { no_anon_dashboard: 1 } });
			await pair(optedOut, { published: 1 });

			const res = await home(userkey);

			expect(entryOf(res, ncfl.Tourn.id).Rounds[0].Judges).toEqual([{ id: ncfl.Judge.id, first: null, last: null, code: 'J1' }]);
			expect(entryOf(res, optedOut.Tourn.id).Rounds[0].Judges).toEqual([{ id: optedOut.Judge.id, first: 'Jo', last: 'Judge', code: 'J1' }]);
		});

		it('opens every round\'s pairing and judges once the tourn has ended but keeps results to their post levels, and no rounds before it starts', async () => {
			const ended = await setup({ tourn: { start: new Date(Date.now() - 3 * DAY), end: new Date(Date.now() - 2 * DAY) } });
			await pair(ended, { published: 0, post_primary: 0 });
			await pair(ended, { published: 0, post_primary: 2 });
			const upcoming = await setup({ tourn: { start: new Date(Date.now() + 2 * DAY), end: new Date(Date.now() + 3 * DAY) } });
			await pair(upcoming, { published: 1, post_primary: 2 });

			const res = await home(userkey);

			const rounds: { post_primary: number; Scores: { tag: string }[] }[] = entryOf(res, ended.Tourn.id).Rounds;
			const unposted = rounds.find((round) => round.post_primary === 0);
			expect(unposted).toMatchObject({ published: 0, Room: { name: '204' }, Opponents: [{ code: 'CD' }], Judges: [{ code: 'J1' }], Scores: [] });
			const posted = rounds.find((round) => round.post_primary === 2);
			expect(posted?.Scores.map((score) => score.tag).sort()).toEqual(['winloss']);
			expect(entryOf(res, upcoming.Tourn.id).Rounds).toEqual([]);
		});
	});

	describe('coach and tab sections', () => {
		const DAY = 86400000;
		const cardOf = (res: request.Response, tourn: number) => res.body.Tourns.find((card: { id: number }) => card.id === tourn);

		it('fills the school tab for a coached school: prefs, counts, signups, the onsite window, strike cards, and fines', async () => {
			const tourn = await factories.tourn.createFull({
				start: new Date(Date.now() - DAY),
				end: new Date(Date.now() + DAY),
				settings: { onsite_registration: 1, onsite_starts: new Date('2026-03-01T07:00:00Z'), onsite_ends: new Date('2026-03-01T09:00:00Z') },
				Event: { abbr: 'LD' },
			});
			await saveSettings({ db, table: 'category', settings: { strike_start: new Date('2026-03-01T08:00:00Z'), strike_end: new Date('2026-03-02T08:00:00Z') }, ownerId: tourn.Category.id });
			const Chapter = await factories.chapter.create();
			await factories.permission.create({ person: personId, chapter: Chapter.id, tag: 'chapter' });
			const School = await factories.school.create({ tourn: tourn.Tourn.id, chapter: Chapter.id, name: 'Lincoln', onsite: 0 });
			const otherSchool = await factories.school.create({ tourn: tourn.Tourn.id });
			const first = await factories.entry.create({ event: tourn.Event.id, school: School.id });
			await factories.entry.create({ event: tourn.Event.id, school: School.id });
			await factories.entry.create({ event: tourn.Event.id, school: School.id, dropped: 1 });
			const Student = await factories.student.create({ first: 'Sam', last: 'Signup' });
			const signup = await factories.entry.create({ event: tourn.Event.id, school: School.id, unconfirmed: 1, students: [Student.id] });
			await factories.entry.create({ event: tourn.Event.id, school: otherSchool.id });
			const { Judge } = await factories.person.createJudge({ Judge: { category: tourn.Category.id, school: School.id } });
			await factories.person.createJudge({ Judge: { category: tourn.Category.id, school: School.id } });
			// an open strike card: the pairing is out but not published, with the school's entry on a non-bye panel
			const elim = await factories.round.create({ event: tourn.Event.id, timeslot: tourn.Timeslot.id, name: 5, label: 'Quarters', published: 2, settings: { strikes_published: 1, strikes_due: new Date('2026-03-01T12:00:00Z') } });
			const panel = await factories.panel.create({ round: elim.id });
			await factories.ballot.create({ panel: panel.id, entry: first.id });
			const judgeFine = await factories.fine.create({ tourn: tourn.Tourn.id, school: School.id, judge: Judge.id });
			const schoolFine = await factories.fine.create({ tourn: tourn.Tourn.id, school: School.id });
			await factories.fine.create({ tourn: tourn.Tourn.id, school: otherSchool.id });

			const res = await home(userkey);

			expect(res.body).toMatchSchema(HomeResponseSchema);
			const card = cardOf(res, tourn.Tourn.id);
			expect(card.roles).toEqual(['coach']);
			expect(card.Schools).toEqual([{
				id: School.id,
				name: 'Lincoln',
				chapter: Chapter.id,
				access: 'full',
				onsite: 0,
				Prefs: [{ category: tourn.Category.id, Category: { name: tourn.Category.name, abbr: tourn.Category.abbr }, start: '2026-03-01T08:00:00.000Z', end: '2026-03-02T08:00:00.000Z', entries: 2 }],
				Counts: { entries: 2, events: 1, judges: 2 },
				Signups: [{ entry: signup.id, Student: { first: 'Sam', last: 'Signup' }, Event: { abbr: 'LD' } }],
				Onsite: { start: '2026-03-01T07:00:00.000Z', end: '2026-03-01T09:00:00.000Z' },
				StrikeCards: [{ round: elim.id, Round: { name: 5, label: 'Quarters' }, due: '2026-03-01T12:00:00.000Z' }],
				Fines: expect.arrayContaining([expect.objectContaining({ id: judgeFine.id, judge: Judge.id }), expect.objectContaining({ id: schoolFine.id })]),
			}]);
			expect(card.Schools[0].Fines).toHaveLength(2);
		});

		it('gives a prefs-only coach the school with its pref sheets only, and no card without a sheet to fill', async () => {
			const withSheet = await factories.tourn.createFull();
			await saveSettings({ db, table: 'category', settings: { strike_start: new Date('2026-03-01T08:00:00Z'), strike_end: new Date('2026-03-02T08:00:00Z') }, ownerId: withSheet.Category.id });
			const withoutSheet = await factories.tourn.createFull();
			const Chapter = await factories.chapter.create();
			await factories.permission.create({ person: personId, chapter: Chapter.id, tag: 'prefs' });
			const School = await factories.school.create({ tourn: withSheet.Tourn.id, chapter: Chapter.id, name: 'Lincoln' });
			await factories.entry.create({ event: withSheet.Event.id, school: School.id });
			const bare = await factories.school.create({ tourn: withoutSheet.Tourn.id, chapter: Chapter.id });
			await factories.entry.create({ event: withoutSheet.Event.id, school: bare.id });
			await factories.fine.create({ tourn: withSheet.Tourn.id, school: School.id });

			const res = await home(userkey);

			expect(res.body.Tourns.map((card: { id: number }) => card.id)).toEqual([withSheet.Tourn.id]);
			expect(cardOf(res, withSheet.Tourn.id).Schools).toEqual([{
				id: School.id,
				name: 'Lincoln',
				chapter: Chapter.id,
				access: 'prefs',
				Prefs: [expect.objectContaining({ category: withSheet.Category.id, entries: 1 })],
			}]);
		});

		it('fills the tab section from the permission with the tourn counts and whether results are out', async () => {
			const published = await factories.tourn.createFull();
			const unpublished = await factories.tourn.createFull();
			await factories.permission.create({ person: personId, tourn: published.Tourn.id, tag: 'tabber', details: '{"events":[1]}' });
			await factories.permission.create({ person: personId, tourn: unpublished.Tourn.id, tag: 'owner' });
			for (const tourn of [published, unpublished]) {
				const School = await factories.school.create({ tourn: tourn.Tourn.id });
				await factories.entry.create({ event: tourn.Event.id, school: School.id });
				await factories.entry.create({ event: tourn.Event.id, school: School.id, dropped: 1 });
			}
			await factories.resultSet.create({ tourn: published.Tourn.id, event: published.Event.id, published: 1 });

			const res = await home(userkey);

			expect(cardOf(res, published.Tourn.id).Tab).toEqual({ tag: 'tabber', details: '{"events":[1]}', Counts: { schools: 1, entries: 1 }, resultsPublished: true });
			expect(cardOf(res, unpublished.Tourn.id).Tab).toEqual({ tag: 'owner', details: null, Counts: { schools: 1, entries: 1 }, resultsPublished: false });
		});
	});

	describe('online rooms', () => {
		const DAY = 86400000;

		it('lists the squad, prep, and utility rooms the person may enter at a running online tourn, and none elsewhere', async () => {
			const running = await factories.tourn.createFull({
				start: new Date(Date.now() - DAY),
				end: new Date(Date.now() + DAY),
				Event: { settings: { online_mode: 'nsda_campus', online_prep: 1 } },
				settings: {
					online_rooms: [
						{ id: '1', name: 'Entry Lounge', type: 'link', url: 'https://zoom.test/entries', access: 'entry' },
						{ id: '2', name: 'Tab Room', type: 'link', url: 'https://zoom.test/tab', access: 'tab' },
					],
				},
			});
			const Chapter = await factories.chapter.create();
			await factories.permission.create({ person: personId, chapter: Chapter.id, tag: 'chapter' });
			const School = await factories.school.create({ tourn: running.Tourn.id, chapter: Chapter.id, name: 'Lincoln' });
			const Student = await factories.student.create({ person: personId });
			const entry = await factories.entry.create({ event: running.Event.id, school: School.id, code: 'AB', students: [Student.id] });
			// an online tourn that has not started gets no rooms
			const upcoming = await factories.tourn.createFull({ start: new Date(Date.now() + 2 * DAY), end: new Date(Date.now() + 3 * DAY), Event: { settings: { online_mode: 'nsda_campus' } } });
			await judgeAt(personId, upcoming);

			const res = await home(userkey);

			expect(res.body).toMatchSchema(HomeResponseSchema);
			const cards = Object.fromEntries(res.body.Tourns.map((card: { id: number }) => [card.id, card]));
			expect(cards[running.Tourn.id].online).toBe(true);
			expect(cards[running.Tourn.id].OnlineRooms).toEqual([
				{ kind: 'school', id: School.id, name: 'Lincoln Squad Room', joinable: true, hybrid: false, mapUrl: null },
				{ kind: 'prep', id: entry.id, name: 'AB Prep Room', joinable: true, hybrid: false, mapUrl: null },
				{ kind: 'utility', id: 1, name: 'Entry Lounge', joinable: true, hybrid: false, mapUrl: null },
			]);
			expect(cards[upcoming.Tourn.id]).toMatchObject({ online: true, OnlineRooms: [] });
		});
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

	it('runs the same number of queries for a one-tourn judge and a heavy account with every role at 15 tourns', async () => {
		const DAY = 86400000;
		const one = await factories.tourn.createFull();
		await judgeAt(personId, one);
		const { count: oneTourn, queries } = await countQueries(() => home(userkey));

		// a coach, judge, competitor, and tab staffer at 15 tourns in the window, with 50 entries at the running one
		const Busy = await factories.person.create();
		const { userkey: busyKey } = await factories.session.create({ person: Busy.id });
		for (let i = 0; i < 15; i++) {
			const running = i === 0;
			const tourn = await factories.tourn.createFull(running
				? { start: new Date(Date.now() - DAY), end: new Date(Date.now() + DAY) }
				: { start: new Date(Date.now() + (i + 1) * DAY), end: new Date(Date.now() + (i + 2) * DAY) });
			await judgeAt(Busy.id, tourn);
			await competeAt(Busy.id, tourn);
			const School = await coachAt(Busy.id, tourn);
			await tabAt(Busy.id, tourn);
			if (running) {
				for (let n = 0; n < 50; n++) await factories.entry.create({ event: tourn.Event.id, school: School.id });
			}
		}
		const selects = (sql: string[]) => sql.filter((query) => query.startsWith('select')).length;
		const heavy = await countQueries(() => home(busyKey));
		const poll = await countQueries(() => home(busyKey, { current: 'true' }));
		const result = heavy.result;

		// the session lookup plus the home stages: tourns; judges, entries, schools, permissions, events, person, tabroom;
		// categories, pools, counts, strikes, judge panels, fines, entry rounds, school entries, school judges, strike cards,
		// school counts, entry counts, published tourns; quizzes, attempts, rounds, panel settings, panel ballots, scores, students
		expect(selects(queries)).toBe(29);
		expect(selects(heavy.queries)).toBe(29);
		expect(selects(poll.queries)).toBe(29);
		expect(oneTourn).toBeLessThanOrEqual(30);
		expect(result.body.Tourns).toHaveLength(15);
		expect(result.body.Tourns[0].Schools[0].Counts.entries).toBe(50);
	});
});
