import request from 'supertest';
import { BallotContextSchema } from '@tabroom/types';
import server from '../../../../../../../app.js';
import factories from '../../../../../../../tests/factories/index.js';

// A judge's ballot on LD Round 3 at 14:00, counting wins and points, flight 2 in room 101,
// with a 90 minute deadline and 45 minute flight offset. AFF1 (Ana Adams) is on Aff
// with a saved 28 and the win; NEG2 (Ben Brown) is on Neg
const createBallot = async (eventType: 'debate' | 'speech') => {
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
