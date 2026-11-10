import request from 'supertest';
import z from 'zod';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { db } from '../../../../data/database.js';
import { ConflictChapterMatchSchema, ConflictPersonMatchSchema, StandingConflictSchema } from '@tabroom/types';

const DAY = 86400000;

// Jo judges LD for Lincoln at a running tourn and has a student there (entry Lincoln JJ). Quinn
// Quill judges there for Riverdale Prep, a chapter whose school has entry Riverdale QQ with
// Quinn's student on it. An ended tourn has the same shape and must never change.
const createWorld = async () => {
	const jo = await factories.person.create({ first: 'Jo', last: 'Judge' });
	const { userkey } = await factories.session.create({ person: jo.id });
	// unique names: the test DB keeps rows between runs, and the searches cap at 25
	const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	const quinn = await factories.person.create({ first: 'Quinn', last: `Quill${suffix}`, email: `quinn_${suffix}@example.com` });
	const riverdale = await factories.chapter.create({ name: `Riverdale Prep ${suffix}`, state: 'NY', city: 'Riverdale' });

	const build = async (overrides: { start: Date; end: Date }) => {
		const tourn = await factories.tourn.createFull({ ...overrides, Event: { abbr: 'LD' } });
		const lincoln = await factories.school.create({ tourn: tourn.Tourn.id, name: 'Lincoln' });
		const riverdaleSchool = await factories.school.create({ tourn: tourn.Tourn.id, name: 'Riverdale', chapter: riverdale.id });
		const joJudge = await factories.judge.create({ person: jo.id, category: tourn.Category.id, school: lincoln.id });
		const quinnJudge = await factories.judge.create({ person: quinn.id, category: tourn.Category.id, school: riverdaleSchool.id });
		const joStudent = await factories.student.create({ person: jo.id });
		const quinnStudent = await factories.student.create({ person: quinn.id });
		const joEntry = await factories.entry.create({ event: tourn.Event.id, school: lincoln.id, code: 'Lincoln JJ', students: [joStudent.id] });
		const quinnEntry = await factories.entry.create({ event: tourn.Event.id, school: riverdaleSchool.id, code: 'Riverdale QQ', students: [quinnStudent.id] });
		const otherEntry = await factories.entry.create({ event: tourn.Event.id, school: riverdaleSchool.id, code: 'Riverdale ZZ' });
		return { tourn: tourn.Tourn, lincoln, riverdaleSchool, joJudge, quinnJudge, joEntry, quinnEntry, otherEntry };
	};

	const running = await build({ start: new Date(Date.now() - DAY), end: new Date(Date.now() + DAY) });
	const ended = await build({ start: new Date(Date.now() - 10 * DAY), end: new Date(Date.now() - 8 * DAY) });
	return { jo, userkey, quinn, riverdale, running, ended };
};

const strikesAt = async (world: Awaited<ReturnType<typeof createWorld>>['running']) =>
	await db.selectFrom('strike').selectAll().where('tourn', '=', world.tourn.id).orderBy('id').execute();

const url = '/v1/user/conflicts';

describe('standing conflicts', () => {
	describe('GET /user/conflicts', () => {
		it('lists only the person\'s own rows, chapters first, with the names they point at', async () => {
			const { jo, userkey, quinn, riverdale } = await createWorld();
			const person = await factories.conflict.create({ person: jo.id, conflicted: quinn.id });
			const chapter = await factories.conflict.create({ person: jo.id, chapter: riverdale.id });
			await factories.conflict.create({ person: quinn.id, conflicted: jo.id });

			const res = await request(server).get(url).asPerson(userkey);

			expect(res.status).toBe(200);
			expect(res.body).toMatchSchema(z.array(StandingConflictSchema));
			expect(res.body).toMatchObject([
				{ id: chapter.id, person: jo.id, conflicted: null, chapter: riverdale.id, Person: null, Chapter: { id: riverdale.id, name: riverdale.name, state: 'NY' } },
				{ id: person.id, person: jo.id, conflicted: quinn.id, chapter: null, Person: { id: quinn.id, first: 'Quinn', last: quinn.last }, Chapter: null },
			]);
		});

		it('requires a login', async () => {
			expect(await request(server).get(url)).toBeProblemResponse(401);
		});
	});

	describe('GET /user/conflicts/people and /chapters', () => {
		it('finds people by last name prefix with the chapters they judged or competed for, and by exact email', async () => {
			const { userkey, quinn, riverdale } = await createWorld();
			const westlake = await factories.chapter.create({ name: `Westlake ${riverdale.id}` });
			await factories.student.create({ person: quinn.id, chapter: westlake.id });
			await factories.student.create({ person: quinn.id, chapter: riverdale.id });

			const byName = await request(server).get(`${url}/people`).query({ last: quinn.last!.slice(0, -2), first: 'Qu' }).asPerson(userkey);
			expect(byName.status).toBe(200);
			expect(byName.body).toMatchSchema(z.array(ConflictPersonMatchSchema));
			expect(byName.body).toEqual([{ id: quinn.id, first: 'Quinn', last: quinn.last, Chapters: [{ id: riverdale.id, name: riverdale.name }, { id: westlake.id, name: westlake.name }] }]);

			const byEmail = await request(server).get(`${url}/people`).query({ email: quinn.email }).asPerson(userkey);
			expect(byEmail.body.map((person: { id: number }) => person.id)).toEqual([quinn.id]);
		});

		it('refuses a first name alone, and finds chapters by name prefix', async () => {
			const { userkey, riverdale } = await createWorld();

			expect(await request(server).get(`${url}/people`).query({ first: 'Quinn' }).asPerson(userkey)).toBeProblemResponse(400);

			const res = await request(server).get(`${url}/chapters`).query({ name: riverdale.name.slice(0, -2) }).asPerson(userkey);
			expect(res.status).toBe(200);
			expect(res.body).toMatchSchema(z.array(ConflictChapterMatchSchema));
			expect(res.body).toEqual([{ id: riverdale.id, name: riverdale.name, city: 'Riverdale', state: 'NY' }]);
			expect(await request(server).get(`${url}/chapters`).query({ name: 'R' }).asPerson(userkey)).toBeProblemResponse(400);

			const wildcards = await request(server).get(`${url}/chapters`).query({ name: '%%' }).asPerson(userkey);
			expect(wildcards.body).toEqual([]);
			const junk = await request(server).get(`${url}/people`).query({ last: '%' }).asPerson(userkey);
			expect(junk.body).toEqual([]);
		});
	});

	describe('POST /user/conflicts', () => {
		it('adds a person and derives the strikes both ways at the running tourn only', async () => {
			const world = await createWorld();
			const { jo, userkey, quinn, running, ended } = world;

			const res = await request(server).post(url).send({ person: quinn.id }).asPerson(userkey);

			expect(res.status).toBe(201);
			expect(res.body).toMatchSchema(StandingConflictSchema);
			expect(res.body).toMatchObject({ person: jo.id, conflicted: quinn.id, chapter: null, added_by: jo.id, Person: { id: quinn.id, first: 'Quinn', last: quinn.last } });

			const strikes = await strikesAt(running);
			expect(strikes).toHaveLength(2);
			expect(strikes).toEqual(expect.arrayContaining([
				expect.objectContaining({ judge: running.joJudge.id, type: 'entry', entry: running.quinnEntry.id, conflict: 1, registrant: 1, conflictee: 1, entered_by: jo.id }),
				expect.objectContaining({ judge: running.quinnJudge.id, type: 'entry', entry: running.joEntry.id, conflict: 1, registrant: 1, conflictee: 1, entered_by: jo.id }),
			]));
			expect(await strikesAt(ended)).toHaveLength(0);
		});

		it('derives at a tourn that is still hidden', async () => {
			const { userkey, quinn, running } = await createWorld();
			await db.updateTable('tourn').set({ hidden: 1 }).where('id', '=', running.tourn.id).execute();

			const res = await request(server).post(url).send({ person: quinn.id }).asPerson(userkey);

			expect(res.status).toBe(201);
			expect(await strikesAt(running)).toHaveLength(2);
		});

		it('adds a chapter and strikes the judge off its schools, skipping a school already marked', async () => {
			const world = await createWorld();
			const { jo, userkey, riverdale, running } = world;
			const already = await factories.strike.create({ judge: running.joJudge.id, tourn: running.tourn.id, type: 'school', school: running.riverdaleSchool.id, conflictee: 0, entered_by: jo.id });

			const res = await request(server).post(url).send({ chapter: riverdale.id }).asPerson(userkey);

			expect(res.status).toBe(201);
			expect(res.body).toMatchObject({ chapter: riverdale.id, Chapter: { id: riverdale.id, name: riverdale.name } });
			expect((await strikesAt(running)).map((strike) => strike.id)).toEqual([already.id]);

			const fresh = await createWorld();
			await request(server).post(url).send({ chapter: fresh.riverdale.id }).asPerson(fresh.userkey);
			expect(await strikesAt(fresh.running)).toMatchObject([{ judge: fresh.running.joJudge.id, type: 'school', school: fresh.running.riverdaleSchool.id, conflictee: 1 }]);
		});

		it('refuses a repeat, a self-conflict, and a malformed body, and 404s an unknown target', async () => {
			const { jo, userkey, quinn } = await createWorld();
			await factories.conflict.create({ person: jo.id, conflicted: quinn.id });

			const repeat = await request(server).post(url).send({ person: quinn.id }).asPerson(userkey);
			expect(repeat).toBeProblemResponse(409);
			expect(repeat.body.reason).toBe('duplicate');
			const self = await request(server).post(url).send({ person: jo.id }).asPerson(userkey);
			expect(self).toBeProblemResponse(409);
			expect(self.body.reason).toBe('self');
			expect(await request(server).post(url).send({ person: quinn.id, chapter: 1 }).asPerson(userkey)).toBeProblemResponse(400);
			expect(await request(server).post(url).send({}).asPerson(userkey)).toBeProblemResponse(400);
			expect(await request(server).post(url).send({ person: 999999999 }).asPerson(userkey)).toBeProblemResponse(404);
			expect(await request(server).post(url).send({ chapter: 999999999 }).asPerson(userkey)).toBeProblemResponse(404);
		});
	});

	describe('DELETE /user/conflicts/:conflictId', () => {
		it('removes the row and the strikes it derived at the running tourn, logging each tourn touched', async () => {
			const world = await createWorld();
			const { jo, userkey, quinn, running, ended } = world;
			const added = await request(server).post(url).send({ person: quinn.id }).asPerson(userkey);
			// a hand-entered conflict on the same judge stays
			const own = await factories.strike.create({ judge: running.joJudge.id, tourn: running.tourn.id, type: 'entry', entry: running.otherEntry.id, conflictee: 1, entered_by: jo.id });
			const stale = await factories.strike.create({ judge: ended.joJudge.id, tourn: ended.tourn.id, type: 'entry', entry: ended.quinnEntry.id, conflictee: 1, entered_by: jo.id });

			const res = await request(server).delete(`${url}/${added.body.id}`).asPerson(userkey);

			expect(res.status).toBe(204);
			expect((await strikesAt(running)).map((strike) => strike.id)).toEqual([own.id]);
			expect((await strikesAt(ended)).map((strike) => strike.id)).toEqual([stale.id]);
			expect(await db.selectFrom('conflict').selectAll().where('id', '=', added.body.id).execute()).toEqual([]);
			expect(await db.selectFrom('change_log').selectAll().where('person', '=', jo.id).where('tag', '=', 'conflicts').execute()).toMatchObject([
				{ tourn: running.tourn.id, description: expect.stringContaining(`Quinn ${quinn.last} removed`) },
			]);
		});

		it("404s another person's row and an unknown one", async () => {
			const { jo, userkey, quinn } = await createWorld();
			const theirs = await factories.conflict.create({ person: quinn.id, conflicted: jo.id });

			expect(await request(server).delete(`${url}/${theirs.id}`).asPerson(userkey)).toBeProblemResponse(404);
			expect(await request(server).delete(`${url}/999999999`).asPerson(userkey)).toBeProblemResponse(404);
			expect(await db.selectFrom('conflict').select('id').where('id', '=', theirs.id).execute()).toHaveLength(1);
		});
	});
});
