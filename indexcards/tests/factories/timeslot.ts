import timeslotRepo from '../../api/repos/timeslotRepo.js';
import { fakeRoundName, noMs} from './factoryUtils.js';
import { faker } from '@faker-js/faker';
import { db } from '../../api/data/database.js';

export function createTimeslotData(overrides = {}) {
	const start = faker.date.future();
	// Random minutes between 30 and 120
	const minutes = faker.number.int({ min: 30, max: 120 });
	const end = new Date(start.getTime() + minutes * 60 * 1000);
	return {
		name: fakeRoundName(),
		start: noMs(start),
		end: noMs(end),
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createTimeslotData(overrides);

	return await timeslotRepo.createTimeslot(db,data);
}
export default {
	createTimeslotData,
	create
};
