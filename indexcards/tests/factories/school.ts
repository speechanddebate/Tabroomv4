import { db } from '../../api/data/database.js';
import schoolRepo from '../../api/repos/schoolRepo.js';

async function createSchoolData(overrides = {}) {
	return {
		...overrides,
	};
};
export async function create(props = {}) {
	const schoolData = await createSchoolData(props);

	return await schoolRepo.createSchool(db,schoolData);
}

export default {
	createSchoolData,
	create,
};