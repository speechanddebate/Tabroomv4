import entryRepo from '../../api/repos/entryRepo.js';
import { db } from '../../api/data/database.js';

function buildEntryData(overrides = {}) {
	return {
		active: 1,
		...overrides,
	};
}

async function create(overrides: Partial<Parameters<typeof entryRepo.createEntry>[1]> & { students?: number[] } = {}) {
	const { students, ...entryOverrides } = overrides;
	const data = buildEntryData(entryOverrides);
	const entry = await entryRepo.createEntry(db, data);

	if (students?.length) {
		await db.insertInto('entry_student')
			.values(students.map((student) => ({ entry: entry.id, student })))
			.execute();
	}

	return entry;
}
export default {
	buildEntryData,
	create,
};
