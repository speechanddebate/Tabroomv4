import panelRepo from '../../api/repos/panelRepo.js';
import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';
import { noMs } from './factoryUtils.js';
import type { Panel } from '../../api/data/schema.js';
import type { Settings } from '../../api/repos/utils/settings.js';
import type { Selectable } from 'kysely';

export function createPanelData(overrides = {}) {
	return {
		publish: 3,
		...overrides,
	};
}

// A panel row as a repo returns it with settings, without touching the DB
export function mock(overrides: Partial<Selectable<Panel>> & { settings?: Settings | null } = {}): Selectable<Panel> & { settings: Settings | null } {
	return {
		id: faker.number.int({ min: 1, max: 1_000_000 }),
		round: null,
		room: null,
		letter: String(faker.number.int({ min: 1, max: 30 })),
		flight: '1',
		bye: 0,
		bracket: null,
		started: null,
		created_at: noMs(new Date()),
		timestamp: noMs(new Date()),
		...createPanelData(),
		settings: {},
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createPanelData(overrides);
	return await panelRepo.createPanel(db, data);
}
export default {
	createPanelData,
	mock,
	create,
};
