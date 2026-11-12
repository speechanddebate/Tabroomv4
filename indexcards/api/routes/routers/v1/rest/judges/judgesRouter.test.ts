import request from 'supertest';
import server from '../../../../../../app.js';
import factories from '../../../../../../tests/factories/index.js';
import z from 'zod';
import { JudgeConflictSchema, JudgeConflictsSchema, UnlinkedJudgeSchema } from '@tabroom/types';
import { db } from '../../../../../data/database.js';
import { saveSettings, type Settings } from '../../../../../repos/utils/index.js';

describe('GET /rest/judges/unlinked/search', () => {
	let userkey: string;
	let first: string;
	let last: string;
	let chapterJudgeId: number;
	let cjFirst: string;
	let cjLast: string;

	beforeAll(async () => {
		const Judge = await factories.judge.create();
		first = Judge.first!;
		last = Judge.last!;

		const ChapterJudge = await factories.chapterJudge.create();
		chapterJudgeId = ChapterJudge.id;
		cjFirst = ChapterJudge.first!;
		cjLast = ChapterJudge.last!;

		({ userkey } = await factories.session.create({
			Person: {
				first,
				last,
			},
		}));
	});

	it('returns 401 without authentication', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: first, last: last })
      .set('Accept', 'application/json')
      .expect(401);

		expect(res).toBeProblemResponse(401);
	});

	it('returns a list of matching unlinked judges', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: first, last: last })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect('Content-Type', /json/)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThanOrEqual(1);
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
	});

	it('returns an empty list when no judges match', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: 'ZZZNoMatch', last: 'ZZZNoMatch' })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect('Content-Type', /json/)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(res.body).toEqual([]);
	});

	it('uses users name to preform search with no params', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.length).toBeGreaterThanOrEqual(1);
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
	});

	it('returns chapter judges in results with correct type', async () => {
		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: cjFirst, last: cjLast })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
		const found = res.body.find((r: { id: number }) => r.id === chapterJudgeId);
		expect(found).toBeDefined();
		expect(found.type).toBe('chapter_judge');
	});

	it('returns both judge and chapter_judge types in a combined search', async () => {
		const ChapterJudge2 = await factories.chapterJudge.create({
			first,
			last,
		});
		const cjId2 = ChapterJudge2.id;

		const res = await request(server)
      .get('/v1/rest/judges/unlinked/search')
      .query({ first: ChapterJudge2.first, last: ChapterJudge2.last })
      .set('Accept', 'application/json')
      .asPerson(userkey)
      .expect(200);

		expect(res).not.toBeProblemResponse();
		expect(res.body).toMatchSchema(z.array(UnlinkedJudgeSchema));
		const types = res.body.map((r: { type: string }) => r.type);
		expect(types).toContain('judge');
		expect(types).toContain('chapter_judge');
		const cjResult = res.body.find((r: { id: number }) => r.id === cjId2);
		expect(cjResult).toBeDefined();
		expect(cjResult.schoolName).toBeDefined();
	});

});

const url = (judge: number) => `/v1/rest/judges/${judge}/conflicts`;

// Jane Doe judges LD for Lincoln. Westlake BB (Ana Adams), Riverdale CC, and Westlake DD are
// the other active entries; Westlake EE is dropped
const createSheet = async (categorySettings: Settings = { conflicts: 1 }) => {
	const tourn = await factories.tourn.createFull({ Event: { abbr: 'LD', name: 'Lincoln-Douglas' } });
	await saveSettings({ db, table: 'category', settings: categorySettings, ownerId: tourn.Category.id });
	const lincoln = await factories.school.create({ tourn: tourn.Tourn.id, name: 'Lincoln' });
	const westlake = await factories.school.create({ tourn: tourn.Tourn.id, name: 'Westlake' });
	const riverdale = await factories.school.create({ tourn: tourn.Tourn.id, name: 'Riverdale' });
	const { Person, Judge } = await factories.person.createJudge({ Judge: { category: tourn.Category.id, school: lincoln.id, code: 'J7', first: 'Jane', last: 'Doe' } });
	const { userkey } = await factories.session.create({ person: Person.id });
	const ana = await factories.student.create({ first: 'Ana', middle: null, last: 'Adams' });
	const own = await factories.entry.create({ event: tourn.Event.id, school: lincoln.id, code: 'Lincoln AA', name: 'Lincoln AA', active: 1 });
	const marked = await factories.entry.create({ event: tourn.Event.id, school: westlake.id, code: 'Westlake BB', name: 'Westlake BB', active: 1, students: [ana.id] });
	const covered = await factories.entry.create({ event: tourn.Event.id, school: riverdale.id, code: 'Riverdale CC', name: 'Riverdale CC', active: 1 });
	const open = await factories.entry.create({ event: tourn.Event.id, school: westlake.id, code: 'Westlake DD', name: 'Westlake DD', active: 1 });
	// a DB trigger derives entry.active from dropped, waitlist, and unconfirmed
	await factories.entry.create({ event: tourn.Event.id, school: westlake.id, code: 'Westlake EE', name: 'Westlake EE', dropped: 1 });
	return { tourn, lincoln, westlake, riverdale, Person, Judge, userkey, ana, own, marked, covered, open };
};

const conflictLogs = async (judge: number) => await db.selectFrom('change_log').selectAll().where('judge', '=', judge).where('tag', '=', 'conflicts').execute();

describe('GET /rest/judges/:judgeId/conflicts', () => {
	it("lists the judge's conflicts, and every active entry with whether the judge may still mark it", async () => {
		const s = await createSheet();
		const coach = await factories.person.create({ first: 'Carl', last: 'Coach' });
		const mine = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.marked.id, conflictee: 1, entered_by: s.Person.id });
		const coaches = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id, conflictee: 0, entered_by: coach.id });
		// hidden: a tab strike and a coach's pref-sheet strike, neither a conflict
		await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.open.id, conflict: 0, registrant: 0 });
		await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.open.id, conflict: 0, registrant: 1 });

		const res = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(JudgeConflictsSchema);
		expect(res.body).toMatchObject({
			Judge: { id: s.Judge.id, code: 'J7', first: 'Jane', last: 'Doe', school: s.lincoln.id, School: { id: s.lincoln.id, name: 'Lincoln' } },
			Tourn: { id: s.tourn.Tourn.id, name: s.tourn.Tourn.name, tz: s.tourn.Tourn.tz, mockTrial: false },
			editable: true,
			Candidates: { Regions: [] },
		});
		expect(res.body.Strikes).toHaveLength(2);
		expect(res.body.Strikes).toEqual(expect.arrayContaining([
			{
				id: mine.id, type: 'entry', entry: s.marked.id, Entry: { id: s.marked.id, code: 'Westlake BB', name: 'Westlake BB', Event: { abbr: 'LD' } },
				school: null, School: null, region: null, Region: null,
				EnteredBy: { role: 'registrant', first: s.Person.first, last: s.Person.last }, removable: true,
			},
			{
				id: coaches.id, type: 'school', entry: null, Entry: null, school: s.riverdale.id, School: { id: s.riverdale.id, name: 'Riverdale' },
				region: null, Region: null, EnteredBy: { role: 'registrant', first: 'Carl', last: 'Coach' }, removable: false,
			},
		]));
		const states = Object.fromEntries(res.body.Candidates.Entries.map((entry: { code: string, state: string }) => [entry.code, entry.state]));
		expect(states).toEqual({ 'Lincoln AA': 'ownSchool', 'Westlake BB': 'entry', 'Riverdale CC': 'school', 'Westlake DD': 'open' });
		expect(res.body.Candidates.Entries.find((entry: { id: number }) => entry.id === s.marked.id)).toMatchObject({
			name: 'Westlake BB',
			event: s.tourn.Event.id,
			Event: { id: s.tourn.Event.id, name: 'Lincoln-Douglas', abbr: 'LD' },
			category: s.tourn.Category.id,
			school: s.westlake.id,
			School: { id: s.westlake.id, name: 'Westlake' },
			Students: [{ id: s.ana.id, first: 'Ana', last: 'Adams' }],
		});
	});

	it("lists only the judge's own category, not another category at the tourn that takes conflicts", async () => {
		const s = await createSheet();
		const cx = await factories.category.create({ tourn: s.tourn.Tourn.id });
		await saveSettings({ db, table: 'category', settings: { conflicts: 1 }, ownerId: cx.id });
		const cxEvent = await factories.event.create({ tourn: s.tourn.Tourn.id, category: cx.id, abbr: 'CX' });
		await factories.entry.create({ event: cxEvent.id, school: s.westlake.id, code: 'Westlake CX' });

		const res = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);

		expect(res.status).toBe(200);
		expect(res.body.Candidates.Entries.map((entry: { code: string }) => entry.code)).not.toContain('Westlake CX');
	});

	it('sends the conflicts but no candidates when the category does not take conflicts from judges', async () => {
		const s = await createSheet({});
		const strike = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id });

		const res = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ editable: false, Candidates: { Entries: [], Regions: [] } });
		expect(res.body.Strikes.map((row: { id: number }) => row.id)).toEqual([strike.id]);
	});

	it('lists the unmarked regions and no entries at a mock trial tournament', async () => {
		const s = await createSheet();
		await saveSettings({ db, table: 'tourn', settings: { mock_trial_registration: 1 }, ownerId: s.tourn.Tourn.id });
		const north = await factories.region.create({ tourn: s.tourn.Tourn.id, name: 'North' });
		const south = await factories.region.create({ tourn: s.tourn.Tourn.id, name: 'South' });
		await factories.region.create({ name: 'Elsewhere' });
		const strike = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'region', region: north.id, conflictee: 1, entered_by: s.Person.id });

		const res = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(JudgeConflictsSchema);
		expect(res.body).toMatchObject({
			Tourn: { mockTrial: true },
			editable: true,
			Strikes: [{ id: strike.id, type: 'region', region: north.id, Region: { id: north.id, name: 'North' }, entry: null, school: null, removable: true }],
			Candidates: { Entries: [], Regions: [{ id: south.id, name: 'South' }] },
		});
	});

	it('allows the tourn\'s tabber, and refuses an anonymous caller, another person, another judge at the tourn, and an unknown judge', async () => {
		const s = await createSheet();
		const tabber = await factories.person.create();
		await factories.permission.create({ person: tabber.id, tourn: s.tourn.Tourn.id, tag: 'tabber' });
		const { userkey: tabberKey } = await factories.session.create({ person: tabber.id });
		const { userkey: strangerKey } = await factories.session.create();
		const { Person: otherJudge } = await factories.person.createJudge({ Judge: { category: s.tourn.Category.id } });
		const { userkey: otherJudgeKey } = await factories.session.create({ person: otherJudge.id });

		expect((await request(server).get(url(s.Judge.id)).asPerson(tabberKey)).status).toBe(200);
		expect(await request(server).get(url(s.Judge.id))).toBeProblemResponse(401);
		expect(await request(server).get(url(s.Judge.id)).asPerson(strangerKey)).toBeProblemResponse(403);
		expect(await request(server).get(url(s.Judge.id)).asPerson(otherJudgeKey)).toBeProblemResponse(403);
		// a judge that doesn't exist matches no relation, so the answer doesn't reveal whether it exists
		expect(await request(server).get(url(999999999)).asPerson(s.userkey)).toBeProblemResponse(403);
	});
});

describe('POST /rest/judges/:judgeId/conflicts', () => {
	const post = (judge: number, userkey: string, body: object) => request(server).post(url(judge)).asPerson(userkey).send(body);

	it('marks an entry, writing the strike row classic writes and a conflicts log row with the category', async () => {
		const s = await createSheet();

		const res = await post(s.Judge.id, s.userkey, { type: 'entry', id: s.open.id });

		expect(res.status).toBe(201);
		expect(res.body).toMatchSchema(JudgeConflictSchema);
		expect(res.body).toMatchObject({
			type: 'entry', entry: s.open.id, Entry: { id: s.open.id, code: 'Westlake DD', name: 'Westlake DD', Event: { abbr: 'LD' } },
			school: null, region: null, EnteredBy: { role: 'registrant', first: s.Person.first, last: s.Person.last }, removable: true,
		});
		expect(await db.selectFrom('strike').selectAll().where('id', '=', res.body.id).executeTakeFirst()).toMatchObject({
			judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.open.id, conflict: 1, registrant: 1, conflictee: 1, entered_by: s.Person.id,
		});
		expect(await conflictLogs(s.Judge.id)).toMatchObject([
			{ tourn: s.tourn.Tourn.id, category: s.tourn.Category.id, person: s.Person.id, description: expect.stringContaining('entry Westlake DD added') },
		]);
		const sheet = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);
		expect(sheet.body.Candidates.Entries.find((entry: { id: number }) => entry.id === s.open.id).state).toBe('entry');
	});

	it('marks a whole school, which then covers its entries', async () => {
		const s = await createSheet();

		const res = await post(s.Judge.id, s.userkey, { type: 'school', id: s.westlake.id });

		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({ type: 'school', school: s.westlake.id, School: { id: s.westlake.id, name: 'Westlake' }, entry: null, removable: true });
		const sheet = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);
		const states = Object.fromEntries(sheet.body.Candidates.Entries.map((entry: { code: string, state: string }) => [entry.code, entry.state]));
		expect(states).toMatchObject({ 'Westlake BB': 'school', 'Westlake DD': 'school', 'Riverdale CC': 'open' });
	});

	it('refuses a covered target or a closed category with 409 and a reason, and writes nothing', async () => {
		const s = await createSheet();
		await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.marked.id, conflictee: 1, entered_by: s.Person.id });
		await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id });

		for (const [body, reason] of [
			[{ type: 'entry', id: s.marked.id }, 'duplicate'],
			[{ type: 'school', id: s.riverdale.id }, 'duplicate'],
			[{ type: 'entry', id: s.covered.id }, 'school'],
			[{ type: 'entry', id: s.own.id }, 'ownSchool'],
			[{ type: 'school', id: s.lincoln.id }, 'ownSchool'],
		] as const) {
			const res = await post(s.Judge.id, s.userkey, body);
			expect(res).toBeProblemResponse(409);
			expect(res.body.reason).toBe(reason);
		}
		expect(await conflictLogs(s.Judge.id)).toHaveLength(0);

		const closed = await createSheet({});
		const res = await post(closed.Judge.id, closed.userkey, { type: 'entry', id: closed.open.id });
		expect(res).toBeProblemResponse(409);
		expect(res.body.reason).toBe('closed');
	});

	it("404s a target the judge could not mark here: another tourn's entry or school, a region outside mock trial, an entry at a mock trial tourn", async () => {
		const s = await createSheet();
		const elsewhere = await createSheet();
		const region = await factories.region.create({ tourn: s.tourn.Tourn.id, name: 'North' });

		expect(await post(s.Judge.id, s.userkey, { type: 'entry', id: elsewhere.open.id })).toBeProblemResponse(404);
		expect(await post(s.Judge.id, s.userkey, { type: 'school', id: elsewhere.westlake.id })).toBeProblemResponse(404);
		expect(await post(s.Judge.id, s.userkey, { type: 'region', id: region.id })).toBeProblemResponse(404);

		await saveSettings({ db, table: 'tourn', settings: { mock_trial_registration: 1 }, ownerId: s.tourn.Tourn.id });
		expect(await post(s.Judge.id, s.userkey, { type: 'entry', id: s.open.id })).toBeProblemResponse(404);
		expect(await post(s.Judge.id, s.userkey, { type: 'school', id: s.westlake.id })).toBeProblemResponse(404);
		const res = await post(s.Judge.id, s.userkey, { type: 'region', id: region.id });
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({ type: 'region', region: region.id, Region: { id: region.id, name: 'North' }, removable: true });
	});

	it('rejects a malformed body', async () => {
		const s = await createSheet();
		expect(await post(s.Judge.id, s.userkey, { type: 'judge', id: 1 })).toBeProblemResponse(400);
		expect(await post(s.Judge.id, s.userkey, { type: 'entry' })).toBeProblemResponse(400);
	});

	it("allows the tourn's tabber, who becomes the enterer but is shown only as tab staff, and refuses other people", async () => {
		const s = await createSheet();
		const tabber = await factories.person.create({ first: 'Tab', last: 'Staff' });
		await factories.permission.create({ person: tabber.id, tourn: s.tourn.Tourn.id, tag: 'tabber' });
		const { userkey: tabberKey } = await factories.session.create({ person: tabber.id });
		const { userkey: strangerKey } = await factories.session.create();
		const { Person: otherJudge } = await factories.person.createJudge({ Judge: { category: s.tourn.Category.id } });
		const { userkey: otherJudgeKey } = await factories.session.create({ person: otherJudge.id });

		const res = await post(s.Judge.id, tabberKey, { type: 'entry', id: s.open.id });
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({ EnteredBy: { role: 'tab', first: null, last: null }, removable: true });
		// marked on the judge's behalf, so the judge may remove it too, and never learns which staffer did it
		const sheet = await request(server).get(url(s.Judge.id)).asPerson(s.userkey);
		expect(sheet.body.Strikes).toMatchObject([{ id: res.body.id, EnteredBy: { role: 'tab', first: null, last: null }, removable: true }]);

		expect(await request(server).post(url(s.Judge.id)).send({ type: 'entry', id: s.marked.id })).toBeProblemResponse(401);
		expect(await post(s.Judge.id, strangerKey, { type: 'entry', id: s.marked.id })).toBeProblemResponse(403);
		expect(await post(s.Judge.id, otherJudgeKey, { type: 'entry', id: s.marked.id })).toBeProblemResponse(403);
	});
});

describe('DELETE /rest/judges/:judgeId/conflicts/:strikeId', () => {
	const del = (judge: number, strike: number, userkey: string) => request(server).delete(`${url(judge)}/${strike}`).asPerson(userkey);

	it('removes a conflict the judge entered, or one declared on their behalf, and logs each', async () => {
		const s = await createSheet();
		const mine = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.marked.id, conflictee: 1, entered_by: s.Person.id });
		const derived = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id, conflictee: 1, entered_by: null });

		expect((await del(s.Judge.id, mine.id, s.userkey)).status).toBe(204);
		expect((await del(s.Judge.id, derived.id, s.userkey)).status).toBe(204);

		expect(await db.selectFrom('strike').select('id').where('id', 'in', [mine.id, derived.id]).execute()).toEqual([]);
		expect(await conflictLogs(s.Judge.id)).toMatchObject([
			{ tourn: s.tourn.Tourn.id, category: s.tourn.Category.id, person: s.Person.id, description: expect.stringContaining('entry Westlake BB removed') },
			{ tourn: s.tourn.Tourn.id, category: s.tourn.Category.id, person: s.Person.id, description: expect.stringContaining('school Riverdale removed') },
		]);
	});

	it("refuses a coach's or tab's row, and 404s a row that isn't on this judge's sheet", async () => {
		const s = await createSheet();
		const coach = await factories.person.create();
		const coaches = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id, conflictee: 0, entered_by: coach.id });
		const hidden = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.open.id, conflict: 0, registrant: 0 });
		const { Judge: other } = await factories.person.createJudge({ Judge: { category: s.tourn.Category.id } });
		const others = await factories.strike.create({ judge: other.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id, conflictee: 1 });

		expect(await del(s.Judge.id, coaches.id, s.userkey)).toBeProblemResponse(403);
		expect(await del(s.Judge.id, hidden.id, s.userkey)).toBeProblemResponse(404);
		expect(await del(s.Judge.id, others.id, s.userkey)).toBeProblemResponse(404);
		expect(await del(s.Judge.id, 999999999, s.userkey)).toBeProblemResponse(404);

		expect(await db.selectFrom('strike').select('id').where('id', 'in', [coaches.id, hidden.id, others.id]).execute()).toHaveLength(3);
		expect(await conflictLogs(s.Judge.id)).toHaveLength(0);
	});

	it("lets a tabber remove what they entered or what was declared from the judge's side, and refuses strangers", async () => {
		const s = await createSheet();
		const tabber = await factories.person.create();
		await factories.permission.create({ person: tabber.id, tourn: s.tourn.Tourn.id, tag: 'tabber' });
		const { userkey: tabberKey } = await factories.session.create({ person: tabber.id });
		const { userkey: strangerKey } = await factories.session.create();
		const coach = await factories.person.create();
		const mine = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'entry', entry: s.marked.id, conflictee: 1, entered_by: s.Person.id });
		const coaches = await factories.strike.create({ judge: s.Judge.id, tourn: s.tourn.Tourn.id, type: 'school', school: s.riverdale.id, conflictee: 0, entered_by: coach.id });

		expect(await del(s.Judge.id, mine.id, strangerKey)).toBeProblemResponse(403);
		expect(await del(s.Judge.id, coaches.id, tabberKey)).toBeProblemResponse(403);
		expect((await del(s.Judge.id, mine.id, tabberKey)).status).toBe(204);
	});
});

