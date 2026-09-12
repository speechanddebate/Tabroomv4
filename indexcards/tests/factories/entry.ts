import entryRepo from '../../api/repos/entryRepo.js';
import { db } from '../../api/data/database.js';

function buildEntryData(overrides = {}) {
	return {
		active: 1,
		...overrides,
	};
}

async function create(overrides = {}) {
	const data = buildEntryData(overrides);
	return await entryRepo.createEntry(db, data);
}
export default {
	buildEntryData,
	create,
};
