import roundRepo from './roundRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('getRounds', () => {
	it('returns published rounds when given valid tournId', async () => {
		//seeded tourn with rounds
		const tournId = 29807;

		//Act
		var Rounds = await roundRepo.getRounds(db, {tournId});

		Rounds.forEach((Round, i) => {
			assert.equal(Round.published, 1, `Round at index ${i} (roundId=${Round.id}) is not published`);
			assert.typeOf(Round.event, 'number', `Round at index ${i} (id=${Round.id}) should contain round.event`);
		});
	});
	it('returns published rounds with stable base fields', async () => {
		//seeded tourn with rounds
		const tournId = 29807;

		//Act
		var rounds = await roundRepo.getRounds(db, {tournId});

		rounds.forEach((round, i) => {
			assert.equal(round.published, 1, `Round at index ${i} (roundId=${round.id}) is not published`);
			assert.typeOf(round.id, 'number', `Round at index ${i} has no id`);
			assert.typeOf(round.id, 'number', `Round at index ${i} has no roundId alias`);
			assert.equal(round.id, round.id, `Round at index ${i} has inconsistent roundId alias`);
		});
	});
	it('returns settings object when settings option is provided', async () => {
		const tournId = 29807;

		const rounds = await roundRepo.getRounds(db, { tournId }, {
			settings: true,
		});

		rounds.forEach((round, i) => {
			assert.equal(round.published, 1, `Round at index ${i} (id=${round.id}) is not published`);
			assert.typeOf(round.id, 'number', `Round at index ${i} has no id`);
			assert.isObject(round.settings, `Round at index ${i} (id=${round.id}) should have settings object`);
		});
	});
});
describe('getSchoolStrikeCards', () => {
	it("returns the rounds with an open strike card for each school's entries", async () => {
		const { Tourn, Event, Timeslot } = await factories.tourn.createFull();
		const mySchool = await factories.school.create({ tourn: Tourn.id });
		const otherSchool = await factories.school.create({ tourn: Tourn.id });
		const mine = await factories.entry.create({ event: Event.id, school: mySchool.id });
		const theirs = await factories.entry.create({ event: Event.id, school: otherSchool.id });
		const due = new Date('2026-03-01T12:00:00Z');
		const open = await factories.round.create({ event: Event.id, timeslot: Timeslot.id, name: 3, label: 'Quarters', published: 2, settings: { strikes_published: 1, strikes_due: due } });
		// out: strike cards not published; pairing fully published; my entry on a bye panel
		const unpublished = await factories.round.create({ event: Event.id, timeslot: Timeslot.id, published: 2 });
		const published = await factories.round.create({ event: Event.id, timeslot: Timeslot.id, published: 1, settings: { strikes_published: 1 } });
		const byes = await factories.round.create({ event: Event.id, timeslot: Timeslot.id, published: 0, settings: { strikes_published: 1 } });
		for (const [round, bye] of [[open, 0], [unpublished, 0], [published, 0], [byes, 1]] as const) {
			const panel = await factories.panel.create({ round: round.id, bye });
			await factories.ballot.create({ panel: panel.id, entry: mine.id });
			await factories.ballot.create({ panel: panel.id, entry: theirs.id });
		}

		const rows = await roundRepo.getSchoolStrikeCards(db, { schools: [mySchool.id] });

		expect(rows).toEqual([{
			id: open.id,
			name: 3,
			label: 'Quarters',
			school: mySchool.id,
			settings: { strikes_due: '2026-03-01 12:00:00' },
		}]);
	});
});
