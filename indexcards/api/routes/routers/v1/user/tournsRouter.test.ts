import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { CurrentBallotSchema, FineSchema, PersonTournPresenceSchema, PersonTournSummarySchema, TournSchema } from '@tabroom/types';
import z from 'zod';

let personId : number;
let userkey: string;
beforeEach(async () => {
	({ id: personId } = await factories.person.create());
	({ userkey } = await factories.session.create({ person: personId }));
});

describe('GET /user/tourns', () => {
	it('Returns the tournaments the user is involved in', async () => {
		const { Tourn } = await factories.person.createBallot({ person: personId });

		const res = await request(server)
			.get(`/v1/user/tourns`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(TournSchema));
		expect(res.body.some((tourn: { id: number }) => tourn.id === Tourn.id)).toBe(true);
	});
	it('returns the most recent tournaments first', async () => {
		// Create the newer tourn first so the order can't come from insertion order
		const { Tourn: Newer, Category: NewerCategory } = await factories.tourn.createFull({
			start: new Date('2026-03-01T00:00:00Z'),
			end: new Date('2026-03-02T00:00:00Z'),
		});
		await factories.person.createJudge({ person: personId, Judge: { category: NewerCategory.id } });
		const { Tourn: Older, Category: OlderCategory } = await factories.tourn.createFull({
			start: new Date('2026-01-01T00:00:00Z'),
			end: new Date('2026-01-02T00:00:00Z'),
		});
		await factories.person.createJudge({ person: personId, Judge: { category: OlderCategory.id } });

		const res = await request(server)
			.get(`/v1/user/tourns`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(TournSchema));
		expect(res.body.map((tourn: { id: number }) => tourn.id)).toEqual([Newer.id, Older.id]);
	});
});

describe('GET /user/tourns/{tournId}', () => {
	it('Returns the entities the user is connected to at a tournament', async () => {
		const { Tourn, Judge } = await factories.person.createBallot({ person: personId });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(PersonTournPresenceSchema);
		expect(res.body.me.judges).toContain(Judge.id);
		expect(res.body.me.categories).toContain(Judge.category);
		expect(res.body.me.rounds.length).toBeGreaterThan(0);
	});
});

describe('GET /user/tourns/{tournId}/summary', () => {
	it('Returns a summary of the users roles in a tournament', async () => {
		const { Tourn } = await factories.person.createBallot({ person: personId });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/summary`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(PersonTournSummarySchema);
		expect(res.body.roles).toContain('judge');
	});
});

describe('GET /user/tourns/{tournId}/fines', () => {
	it('Returns the users fines for a tournament', async () => {
		const Tourn = await factories.tourn.create({ settings: { currency: '€' } });
		const School = await factories.school.create({ tourn: Tourn.id });
		const Fine = await factories.fine.create({ person: personId, tourn: Tourn.id, school: School.id });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/fines`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(FineSchema));
		const fine = res.body.find((fine: { id: number }) => fine.id === Fine.id);
		expect(fine.currency).toBe('€');
		expect(fine.judge).toBeNull();
		expect(fine.Judge).toBeNull();
	});
	it('Returns the judge a fine was assessed against', async () => {
		const { Tourn, Judge } = await factories.person.createBallot({ person: personId });
		const School = await factories.school.create({ tourn: Tourn.id });
		const Fine = await factories.fine.create({ person: personId, judge: Judge.id, tourn: Tourn.id, school: School.id });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/fines`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(FineSchema));
		const fine = res.body.find((fine: { id: number }) => fine.id === Fine.id);
		expect(fine.judge).toBe(Judge.id);
		expect(fine.Judge).toEqual({ first: Judge.first, last: Judge.last });
	});
	it('Returns the fines of the schools the person coaches and no other school', async () => {
		const Tourn = await factories.tourn.create();
		const myChapter = await factories.chapter.create();
		const otherChapter = await factories.chapter.create();
		const mySchool = await factories.school.create({ tourn: Tourn.id, chapter: myChapter.id });
		const otherSchool = await factories.school.create({ tourn: Tourn.id, chapter: otherChapter.id });
		await factories.permission.create({ person: personId, chapter: myChapter.id, tag: 'chapter' });
		// The other school's coach was fined; their chapter permission must not make the fine visible to me
		const otherCoach = await factories.person.create();
		await factories.permission.create({ person: otherCoach.id, chapter: otherChapter.id, tag: 'chapter' });
		const mine = await factories.fine.create({ tourn: Tourn.id, school: mySchool.id });
		const theirs = await factories.fine.create({ tourn: Tourn.id, school: otherSchool.id, person: otherCoach.id });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/fines`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(FineSchema));
		const ids = res.body.map((fine: { id: number }) => fine.id);
		expect(ids).toContain(mine.id);
		expect(ids).not.toContain(theirs.id);
	});
});

describe('GET /user/tourns/{tournId}/ballots/current', () => {
	it('Returns the current user ballots', async () => {
		const { Tourn } = await factories.person.createBallot({ person: personId });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/ballots/current`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body[0].Room).toBeNull();
	});
	it('Returns the room to join for an online round', async () => {
		const { Tourn } = await factories.person.createBallot({
			person: personId,
			Event: { settings: { online_mode: 'sync' } },
			Round: { settings: { override_link: 'https://zoom.test/room' } },
		});

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/ballots/current`)
			.asPerson(userkey)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body[0].Room).toEqual({ name: null, joinable: true, hybrid: false, mapUrl: null });
	});
	it('Returns the room of each ballot\'s own section', async () => {
		const tourn = await factories.tourn.createFull();
		const { Judge } = await factories.person.createJudge({ person: personId, Judge: { category: tourn.Category.id } });
		const rooms = new Map<number, string>();
		for (const name of ['204', '205']) {
			const panel = await factories.panel.create({ round: tourn.Round.id, room: (await factories.room.create({ name })).id });
			await factories.ballot.create({ panel: panel.id, judge: Judge.id, entry: (await factories.entry.create()).id });
			rooms.set(panel.id, name);
		}

		const res = await request(server)
			.get(`/v1/user/tourns/${tourn.Tourn.id}/ballots/current`)
			.asPerson(userkey)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(new Map(res.body.map((ballot: { id: number; Room: { name: string } }) => [ballot.id, ballot.Room.name]))).toEqual(rooms);
	});
	it('Returns a Campus room named after the section', async () => {
		const tourn = await factories.tourn.createFull({ Event: { abbr: 'CX', settings: { online_mode: 'nsda_campus' } } });
		const { Judge } = await factories.person.createJudge({ person: personId, Judge: { category: tourn.Category.id } });
		const panel = await factories.panel.create({ round: tourn.Round.id, letter: 'B' });
		await factories.ballot.create({ panel: panel.id, judge: Judge.id, entry: (await factories.entry.create()).id });

		const res = await request(server)
			.get(`/v1/user/tourns/${tourn.Tourn.id}/ballots/current`)
			.asPerson(userkey)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body[0].Room).toEqual({ name: 'CX B', joinable: true, hybrid: false, mapUrl: null });
	});
	it('Returns a Campus room named after the matched event\'s section when events share rooms', async () => {
		const match = await factories.event.create({ abbr: 'PF' });
		const tourn = await factories.tourn.createFull({ Event: { abbr: 'CX', settings: { online_mode: 'nsda_campus', online_event_match: String(match.id) } }, Round: { name: 2 } });
		const { Judge } = await factories.person.createJudge({ person: personId, Judge: { category: tourn.Category.id } });
		const panel = await factories.panel.create({ round: tourn.Round.id, letter: 'C' });
		await factories.ballot.create({ panel: panel.id, judge: Judge.id, entry: (await factories.entry.create()).id });
		// the PF section the judge meets in: same round name and letter
		await factories.panel.create({ round: (await factories.round.create({ event: match.id, name: 2 })).id, letter: 'C' });

		const res = await request(server)
			.get(`/v1/user/tourns/${tourn.Tourn.id}/ballots/current`)
			.asPerson(userkey)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body[0].Room).toEqual({ name: 'PF C', joinable: true, hybrid: false, mapUrl: null });
	});
	// Classic's rule: published, or released to judges only (judges_ballots_visible, "Publish ballots but not schematic")
	it.each([
		['an unpublished round', 0, 0, 0],
		['an unpublished round released to judges', 0, 1, 1],
		['a published round', 1, 0, 1],
	])('Returns %s only when judges can see it', async (_label, published, judgesBallotsVisible, count) => {
		const { Tourn } = await factories.person.createBallot({
			person: personId,
			Round: { published, settings: { judges_ballots_visible: judgesBallotsVisible } },
		});
		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/ballots/current`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body).toHaveLength(count);
	});
	it('Does not return audited ballots', async () => {
		const { Tourn } = await factories.person.createBallot({person: personId, Ballot: { audit: 1 }, Event: { type: 'debate' } });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/ballots/current`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body).toHaveLength(0);

	});
	it('Returns audited ballots for current Mock Trial and Congress chairs', async () => {
		const { Tourn } = await factories.person.createBallot({person: personId, 
			Ballot: { audit: 1, chair: 1 }, 
			Event: { type: 'mock_trial' }
		});
		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/ballots/current`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);
			
		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body).toHaveLength(1);

		const { Tourn: Tourn2 }=await factories.person.createBallot({person: personId, 
			Ballot: { audit: 1, chair: 1 }, 
			Event: { type: 'congress' }
		 });
		const res2 = await request(server)
			.get(`/v1/user/tourns/${Tourn2.id}/ballots/current`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);
			
		expect(res2.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res2.body).toHaveLength(1);
	});
	it('does not return async ballots past the deadline', async () => {
		const pastDeadline = new Date(Date.now() - 1000);
		const { Tourn } = await factories.person.createBallot({person: personId, Timeslot: { end: pastDeadline }, Event: { settings: { online_mode: 'async' } } });

		const res = await request(server)
			.get(`/v1/user/tourns/${Tourn.id}/ballots/current`)
			.set('Accept', 'application/json')
			.asPerson(userkey)
			.expect('Content-Type', /json/)
			.expect(200);

		expect(res.body).toMatchSchema(z.array(CurrentBallotSchema));
		expect(res.body).toHaveLength(0);
	});
	});
