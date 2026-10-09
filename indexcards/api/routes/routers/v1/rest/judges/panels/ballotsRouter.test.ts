import request from 'supertest';
import { BallotContextSchema, BallotFeedbackSchema, BallotProgressSchema, BallotReviewSchema, BallotValidationProblemSchema } from '@tabroom/types';
import { db } from '../../../../../../data/database.js';
import server from '../../../../../../../app.js';
import factories from '../../../../../../../tests/factories/index.js';

// A judge's ballot on LD Round 3 at 14:00, counting wins and points, flight 2 in room 101,
// with a 90 minute deadline and 45 minute flight offset. AFF1 (Ana Adams) is on Aff
// with a saved 28 and the win; NEG2 (Ben Brown) is on Neg
const createBallot = async (eventType: 'debate' | 'speech', eventSettings: Record<string, string> = {}) => {
	const person = await factories.person.create();
	const { userkey } = await factories.session.create({ person: person.id });

	const tourn = await factories.tourn.create({ tz: 'America/Chicago', end: new Date('2026-10-04T23:00:00Z'), settings: { bias_statement: '<p>Own</p>' } });
	const category = await factories.category.create({ tourn: tourn.id });
	const event = await factories.event.create({
		tourn: tourn.id,
		category: category.id,
		type: eventType,
		abbr: 'LD',
		settings: {
			prelim_decision_deadline: '90',
			flight_offset: '45',
			resolution: 'Resolved: tests are good.',
			ballot_rules: 'No tied points.',
			rfd_plz: '50',
			comments_plz: '25',
			...eventSettings,
		},
	});
	const timeslot = await factories.timeslot.create({ tourn: tourn.id });
	const protocol = await factories.protocol.create({ tourn: tourn.id, tiebreaks: ['winloss', 'points'] });
	const round = await factories.round.create({
		event: event.id,
		timeslot: timeslot.id,
		protocol: protocol.id,
		type: 'prelim',
		name: 3,
		flighted: 2,
		start_time: new Date('2026-10-03T14:00:00Z'),
		settings: { notes: 'Bring timers' },
	});
	// An empty url, like most rooms in prod, comes back as null
	const room = await factories.room.create({ name: '101', url: '' });
	const panel = await factories.panel.create({ round: round.id, room: room.id, flight: '2' });
	const judge = await factories.judge.create({ person: person.id, category: category.id, code: 'A1', first: 'Jane', middle: null, last: 'Doe' });

	const ana = await factories.student.create({ first: 'Ana', last: 'Adams' });
	const ben = await factories.student.create({ first: 'Ben', last: 'Brown' });
	const aff = await factories.entry.create({ event: event.id, code: 'AFF1', students: [ana.id] });
	const neg = await factories.entry.create({ event: event.id, code: 'NEG2', students: [ben.id] });
	const affBallot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: aff.id, side: 1 });
	const negBallot = await factories.ballot.create({ judge: judge.id, panel: panel.id, entry: neg.id, side: 2 });
	await factories.score.create({ ballot: affBallot.id, tag: 'winloss', value: 1 });
	await factories.score.create({ ballot: affBallot.id, student: ana.id, tag: 'point', value: 28 });
	await factories.score.create({ ballot: affBallot.id, tag: 'rfd', content: '<p>Aff won the framework.</p>' });
	await factories.score.create({ ballot: negBallot.id, tag: 'rfd', content: '<p>Aff won the framework.</p>' });
	await factories.score.create({ ballot: negBallot.id, tag: 'comments', content: '<p>Slow down.</p>' });

	return { userkey, tourn, judge, panel, round, aff, neg, ana, ben, affBallot, negBallot };
};

const url = (judge: number, panel: number) => `/v1/rest/judges/${judge}/panels/${panel}/ballots`;

describe('GET /rest/judges/:judgeId/panels/:panelId/ballots', () => {
	it('returns the debate ballot context', async () => {
		const { userkey, tourn, judge, panel, round, aff, neg, ana, ben, affBallot, negBallot } = await createBallot('debate');

		const res = await request(server).get(url(judge.id, panel.id)).asPerson(userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(BallotContextSchema);
		expect(res.body).toEqual({
			eventType: 'debate',
			status: 'scored',
			chairLabel: null,
			topic: { label: 'Resolution', text: 'Resolved: tests are good.' },
			rules: ['No tied points.'],
			tz: 'America/Chicago',
			Tourn: { id: tourn.id },
			Event: { abbr: 'LD' },
			Round: { id: round.id },
			roundName: 'Round 3',
			flight: 2,
			roundNotes: 'Bring timers',
			Room: { name: '101', url: null },
			Judge: { code: 'A1', first: 'Jane', middle: null, last: 'Doe' },
			ballotHeader: '<p>Own</p>',
			roundStart: '2026-10-03T14:45:00.000Z',
			decisionDeadline: '2026-10-03T16:15:00.000Z',
			onlineMode: null,
			scoring: {
				winloss: { lpw: 'confirm' },
				points: { min: 0, max: 30, step: 1, ties: false, team: false },
				feedback: {
					rfd: '<p>Aff won the framework.</p>',
					minWords: { rfd: 50, comments: 25 },
					editableUntil: '2026-10-04T23:00:00.000Z',
				},
			},
			Entries: [
				{
					ballot: affBallot.id, entry: aff.id, code: 'AFF1', side: 1, notes: null, doubled: 0, comments: null, points: null,
					Students: [{ id: ana.id, first: 'Ana', last: 'Adams', pronoun: null, points: 28 }],
				},
				{
					ballot: negBallot.id, entry: neg.id, code: 'NEG2', side: 2, notes: null, doubled: 0, comments: '<p>Slow down.</p>', points: null,
					Students: [{ id: ben.id, first: 'Ben', last: 'Brown', pronoun: null, points: null }],
				},
			],
			otherJudges: [],
			timers: { speech: 5, prep: 4 },
			pointScale: [],
			speechTimes: [],
			ballotTopics: null,
			docShare: null,
			logo: null,
			debate: { affLabel: 'Aff', negLabel: 'Neg', sides: 'locked', winner: affBallot.id },
		});
	});

	it('sends ballots the beta can\'t render to classic', async () => {
		const { userkey, tourn, judge, panel } = await createBallot('speech');

		const res = await request(server).get(url(judge.id, panel.id)).asPerson(userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(BallotContextSchema);
		expect(res.body).toEqual({
			eventType: 'other',
			judge: judge.id,
			panel: panel.id,
			tourn: tourn.id,
			supported: false,
		});
	});
});

describe('PUT /rest/judges/:judgeId/panels/:panelId/ballots', () => {
	// The fixture requires 50 words of RFD and 25 of comments; these tests turn them off
	const noMinimums = { rfd_plz: '0', comments_plz: '0' };

	const body = (ballot: Awaited<ReturnType<typeof createBallot>>, overrides = {}) => ({
		eventType: 'debate',
		winner: ballot.negBallot.id,
		lowPointWin: false,
		points: [
			{ student: ballot.ana.id, points: 27 },
			{ student: ballot.ben.id, points: 29 },
		],
		feedback: { rfd: null, Entries: [] },
		...overrides,
	});

	const scores = async (ballot: Awaited<ReturnType<typeof createBallot>>) => await db.selectFrom('score')
		.select(['ballot', 'tag', 'value'])
		.where('ballot', 'in', [ballot.affBallot.id, ballot.negBallot.id])
		.where('tag', 'in', ['winloss', 'point'])
		.orderBy('tag').orderBy('ballot')
		.execute();

	it('saves the ballot and returns it for review', async () => {
		const ballot = await createBallot('debate', noMinimums);

		const res = await request(server).put(url(ballot.judge.id, ballot.panel.id)).send(body(ballot)).asPerson(ballot.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(BallotReviewSchema);
		expect(res.body).toMatchObject({ eventType: 'debate', saved: true, winner: ballot.negBallot.id, lowPointWin: false });
		expect(await scores(ballot)).toEqual([
			{ ballot: ballot.affBallot.id, tag: 'point', value: 27 },
			{ ballot: ballot.negBallot.id, tag: 'point', value: 29 },
			{ ballot: ballot.affBallot.id, tag: 'winloss', value: 0 },
			{ ballot: ballot.negBallot.id, tag: 'winloss', value: 1 },
		]);
	});

	it('only validates with dryRun', async () => {
		const ballot = await createBallot('debate', noMinimums);

		const res = await request(server).put(`${url(ballot.judge.id, ballot.panel.id)}?dryRun=true`).send(body(ballot)).asPerson(ballot.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ saved: false });
		// The fixture's saved scores are untouched: Aff's win and 28
		expect(await scores(ballot)).toEqual([
			{ ballot: ballot.affBallot.id, tag: 'point', value: 28 },
			{ ballot: ballot.affBallot.id, tag: 'winloss', value: 1 },
		]);
	});

	it('returns every ballot error as a 422', async () => {
		const ballot = await createBallot('debate');

		const res = await request(server).put(url(ballot.judge.id, ballot.panel.id)).send(body(ballot, { winner: null })).asPerson(ballot.userkey);

		expect(res).toBeProblemResponse(422);
		expect(res.body).toMatchSchema(BallotValidationProblemSchema);
		expect(res.body.errors.map((error: { field: string }) => error.field)).toEqual(['winner', 'rfd', 'comments', 'comments']);
	});

	it('rejects a body that doesn\'t match the schema', async () => {
		const ballot = await createBallot('debate', noMinimums);

		const res = await request(server).put(url(ballot.judge.id, ballot.panel.id)).send(body(ballot, { points: 'lots' })).asPerson(ballot.userkey);

		expect(res).toBeProblemResponse(400);
	});

	it('refuses a confirmed ballot', async () => {
		const ballot = await createBallot('debate', noMinimums);
		await db.updateTable('ballot').set({ audit: 1 }).where('panel', '=', ballot.panel.id).execute();

		const res = await request(server).put(url(ballot.judge.id, ballot.panel.id)).send(body(ballot)).asPerson(ballot.userkey);

		expect(res).toBeProblemResponse(409);
	});

	it('refuses a ballot the beta can\'t handle', async () => {
		const ballot = await createBallot('debate', { ...noMinimums, ballot_rubric: '1' });

		const res = await request(server).put(url(ballot.judge.id, ballot.panel.id)).send(body(ballot)).asPerson(ballot.userkey);

		expect(res).toBeProblemResponse(409);
		expect(res.body.reasons).toEqual(['event setting ballot_rubric']);
	});
});

describe('POST /rest/judges/:judgeId/panels/:panelId/ballots/start', () => {
	const started = async (panel: number) => await db.selectFrom('ballot')
		.select(['started_by', 'judge_started'])
		.where('panel', '=', panel)
		.execute();

	it('marks every one of the judge\'s ballot rows started by the judge', async () => {
		const ballot = await createBallot('debate');
		await db.deleteFrom('score').where('ballot', 'in', [ballot.affBallot.id, ballot.negBallot.id]).execute();

		const res = await request(server).post(`${url(ballot.judge.id, ballot.panel.id)}/start`).asPerson(ballot.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(BallotProgressSchema);
		expect(res.body).toEqual({ status: 'started' });

		const rows = await started(ballot.panel.id);
		expect(rows.map(row => row.started_by)).toEqual([ballot.judge.person, ballot.judge.person]);
		expect(rows.every(row => row.judge_started instanceof Date)).toBe(true);
	});

	it('keeps the first start', async () => {
		const ballot = await createBallot('debate');
		const first = new Date('2026-10-03T14:00:00Z');
		await db.updateTable('ballot').set({ judge_started: first, started_by: ballot.judge.person }).where('panel', '=', ballot.panel.id).execute();

		const res = await request(server).post(`${url(ballot.judge.id, ballot.panel.id)}/start`).asPerson(ballot.userkey);

		expect(res.status).toBe(200);
		expect((await started(ballot.panel.id)).map(row => row.judge_started)).toEqual([first, first]);
	});

	it('does nothing for someone entering the ballot for the judge', async () => {
		const ballot = await createBallot('debate');
		const owner = await factories.person.create();
		await factories.permission.create({ person: owner.id, tourn: ballot.tourn.id, tag: 'owner' });
		const { userkey } = await factories.session.create({ person: owner.id });

		const res = await request(server).post(`${url(ballot.judge.id, ballot.panel.id)}/start`).asPerson(userkey);

		expect(res.status).toBe(200);
		expect(await started(ballot.panel.id)).toEqual([
			{ started_by: null, judge_started: null },
			{ started_by: null, judge_started: null },
		]);
	});
});

describe('GET /rest/judges/:judgeId/panels/:panelId/ballots/status', () => {
	it('returns where the judge is with the ballot', async () => {
		const ballot = await createBallot('debate');

		const res = await request(server).get(`${url(ballot.judge.id, ballot.panel.id)}/status`).asPerson(ballot.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(BallotProgressSchema);
		expect(res.body).toEqual({ status: 'scored' });
	});

	it('notices a ballot confirmed elsewhere', async () => {
		const ballot = await createBallot('debate');
		await db.updateTable('ballot').set({ audit: 1 }).where('panel', '=', ballot.panel.id).execute();

		const res = await request(server).get(`${url(ballot.judge.id, ballot.panel.id)}/status`).asPerson(ballot.userkey);

		expect(res.body).toEqual({ status: 'confirmed' });
	});
});

describe('PUT /rest/judges/:judgeId/panels/:panelId/ballots/feedback', () => {
	// The fixture's tournament ended on 2026-10-04, after which feedback can't change
	const openTourn = async (ballot: Awaited<ReturnType<typeof createBallot>>) => {
		await db.updateTable('tourn').set({ end: new Date('2099-01-01T00:00:00Z') }).where('id', '=', ballot.tourn.id).execute();
	};

	it('saves the feedback and returns it', async () => {
		const ballot = await createBallot('debate');
		await openTourn(ballot);

		const res = await request(server).put(`${url(ballot.judge.id, ballot.panel.id)}/feedback`)
			.send({ rfd: '<p>Neg won the weighing.</p>', Entries: [{ ballot: ballot.affBallot.id, comments: '<p>Extend your cards.</p>' }] })
			.asPerson(ballot.userkey);

		expect(res.status).toBe(200);
		expect(res.body).toMatchSchema(BallotFeedbackSchema);
		expect(res.body).toEqual({
			rfd: '<p>Neg won the weighing.</p>',
			Entries: [
				{ ballot: ballot.affBallot.id, comments: '<p>Extend your cards.</p>' },
				{ ballot: ballot.negBallot.id, comments: '<p>Slow down.</p>' },
			],
		});
	});

	it('returns a 422 for comments on another judge\'s ballot', async () => {
		const ballot = await createBallot('debate');
		await openTourn(ballot);
		const other = await factories.ballot.create();

		const res = await request(server).put(`${url(ballot.judge.id, ballot.panel.id)}/feedback`)
			.send({ Entries: [{ ballot: other.id, comments: '<p>Hi</p>' }] })
			.asPerson(ballot.userkey);

		expect(res).toBeProblemResponse(422);
		expect(res.body).toMatchSchema(BallotValidationProblemSchema);
	});

	it('returns a 409 after the tournament ends', async () => {
		const ballot = await createBallot('debate');

		const res = await request(server).put(`${url(ballot.judge.id, ballot.panel.id)}/feedback`)
			.send({ rfd: '<p>Late</p>' })
			.asPerson(ballot.userkey);

		expect(res).toBeProblemResponse(409);
	});
});
