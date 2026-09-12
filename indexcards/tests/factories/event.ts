import { db } from '../../api/data/database.js';
import eventRepo from '../../api/repos/eventRepo.js';
import { faker } from '@faker-js/faker';


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

export async function create(overrides = {}) {
	const data = createEventData(overrides);
	const event = await eventRepo.createEvent(db,data);

	return {
		eventId: event.id,
		getEvent: () => event,
	};
}
export default {
	createEventData,
	create,
};