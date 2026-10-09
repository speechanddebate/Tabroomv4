import { db } from '../../api/data/database.js';
import eventRepo from '../../api/repos/eventRepo.js';
import { faker } from '@faker-js/faker';
import { noMs } from './factoryUtils.js';
import type { Event } from '../../api/data/schema.js';
import type { Settings } from '../../api/repos/utils/index.js';
import type { Selectable } from 'kysely';


enum EventType {
	Speech = 'speech',
	Congress = 'congress',
	Debate = 'debate',
	Wudc = 'wudc',
	Wsdc = 'wsdc',
	Attendee = 'attendee',
	MockTrial = 'mock_trial',
	Academic = 'academic',
}

enum EventLevel {
	Open = 'open',
	Jv = 'jv',
	Novice = 'novice',
	Champ = 'champ',
	EsOpen = 'es-open',
	EsNovice = 'es-novice',
	Middle = 'middle',
}

const EVENT_TYPES = Object.values(EventType);
const EVENT_LEVELS = Object.values(EventLevel);

export function createEventData(overrides = {}) {
	return {
		name: faker.lorem.words(3),
		abbr: faker.lorem.word(),
		type: faker.helpers.arrayElement(EVENT_TYPES),
		level: faker.helpers.arrayElement(EVENT_LEVELS),
		...overrides,
	};
}

// An event row as a repo returns it with settings, without touching the DB
export function mock(overrides: Partial<Selectable<Event>> & { settings?: Settings | null } = {}): Selectable<Event> & { settings: Settings | null } {
	return {
		id: faker.number.int({ min: 1, max: 1_000_000 }),
		tourn: null,
		category: null,
		code_style: 'numbers',
		fee: null,
		nsda_category: null,
		pattern: null,
		rating_subset: null,
		created_at: noMs(new Date()),
		timestamp: noMs(new Date()),
		...createEventData(),
		settings: {},
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createEventData(overrides);
	return await eventRepo.createEvent(db,data);
}
export default {
	createEventData,
	mock,
	create,
};