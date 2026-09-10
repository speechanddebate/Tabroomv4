import roundRepo from './roundRepo.js';
import { db } from '../data/database.js';

describe('getRounds', () => {
	it('returns published rounds when given valid tournId', async () => {
		//seeded tourn with rounds
		const tournId = 29807;

		//Act
		var rounds = await roundRepo.getRounds(db, {tournId});

		rounds.forEach((round, i) => {
			assert.equal(round.published, 1, `Round at index ${i} (roundId=${round.roundId}) is not published`);
			assert.typeOf(round.event, 'number', `Round at index ${i} (id=${round.id}) should contain round.event`);
		});
	});
	it('returns published rounds with stable base fields', async () => {
		//seeded tourn with rounds
		const tournId = 29807;

		//Act
		var rounds = await roundRepo.getRounds(db, {tournId});

		rounds.forEach((round, i) => {
			assert.equal(round.published, 1, `Round at index ${i} (roundId=${round.roundId}) is not published`);
			assert.typeOf(round.id, 'number', `Round at index ${i} has no id`);
			assert.typeOf(round.roundId, 'number', `Round at index ${i} has no roundId alias`);
			assert.equal(round.roundId, round.id, `Round at index ${i} has inconsistent roundId alias`);
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
