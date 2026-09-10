import roundRepo from '../../api/repos/roundRepo.js';
import { db } from '../../api/data/database.js';

export function createRoundData(overrides = {}) {
	return {
		published: 1,
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createRoundData(overrides);
	const Round = await roundRepo.createRound(db,data);

	return {
		roundId: Round.id,
		getRound: () => roundRepo.getRound(db, Round.id, { settings: true }),
	};
}

export default {
	createRoundData,
	create,
};
