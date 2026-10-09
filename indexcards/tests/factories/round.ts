import roundRepo from '../../api/repos/roundRepo.js';
import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';
import { noMs } from './factoryUtils.js';
import type { Round } from '../../api/data/schema.js';
import type { Settings } from '../../api/repos/utils/index.js';
import type { Selectable } from 'kysely';

const ROUND_TYPES = ['prelim', 'highlow', 'highhigh', 'snaked_prelim', 'elim', 'final', 'runoff'];

export function createRoundData(overrides = {}) {
	return {
		published: 1,
		...overrides,
	};
}

// A round row as a repo returns it with settings, without touching the DB
export function mock(overrides: Partial<Selectable<Round>> & { settings?: Settings | null } = {}): Selectable<Round> & { settings: Settings | null } {
	return {
		id: faker.number.int({ min: 1, max: 1_000_000 }),
		event: null,
		timeslot: null,
		site: null,
		protocol: null,
		name: faker.number.int({ min: 1, max: 8 }),
		label: null,
		type: faker.helpers.arrayElement(ROUND_TYPES),
		flighted: 1,
		start_time: null,
		paired_at: null,
		post_primary: null,
		post_secondary: null,
		post_feedback: null,
		runoff: null,
		created_at: noMs(new Date()),
		timestamp: noMs(new Date()),
		...createRoundData(),
		settings: {},
		...overrides,
	};
}

export async function create(overrides: Parameters<typeof roundRepo.createRound>[1] = {}) {
	const data = createRoundData(overrides);
	return await roundRepo.createRound(db,data);
}

export default {
	createRoundData,
	mock,
	create,
};
