import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';
import { noMs } from './factoryUtils.js';
import type { Protocol } from '../../api/data/schema.js';
import type { Insertable, Selectable } from 'kysely';

export function createProtocolData(overrides: Partial<Insertable<Protocol>> = {}) {
	return {
		name: `${faker.word.adjective()} Tiebreakers`,
		...overrides,
	};
}

// A protocol row as a repo returns it, without touching the DB
export function mock(overrides: Partial<Selectable<Protocol>> = {}): Selectable<Protocol> {
	return {
		id: faker.number.int({ min: 1, max: 1_000_000 }),
		tourn: null,
		timestamp: noMs(new Date()),
		...createProtocolData(),
		...overrides,
	};
}

// tiebreaks are tiebreak names in priority order, each counted in every round
export async function create(overrides: Partial<Insertable<Protocol>> & { tiebreaks?: string[] } = {}) {
	const { tiebreaks, ...protocolOverrides } = overrides;
	const protocol = await db.insertInto('protocol')
		.values(createProtocolData(protocolOverrides))
		.returningAll()
		.executeTakeFirstOrThrow();

	if (tiebreaks?.length) {
		await db.insertInto('tiebreak')
			.values(tiebreaks.map((name, i) => ({ protocol: protocol.id, name, count: 'all', priority: i + 1 })))
			.execute();
	}

	return protocol;
}

export default {
	createProtocolData,
	mock,
	create,
};
