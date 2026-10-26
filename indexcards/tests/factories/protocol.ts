import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';
import { noMs } from './factoryUtils.js';
import type { Protocol, Tiebreak } from '../../api/data/schema.js';
import type { Insertable, Selectable } from 'kysely';

// A tiebreak name counts in every round. The object form sets the other columns,
// e.g. { name: 'points', count: 'prelim', child: otherProtocol.id, violation: 1 }
export type TiebreakSpec = string | (Omit<Insertable<Tiebreak>, 'protocol'> & { name: string });

const tiebreakData = (protocolId: number, tiebreak: TiebreakSpec, priority: number): Insertable<Tiebreak> => ({
	protocol: protocolId,
	count: 'all',
	priority,
	...(typeof tiebreak === 'string' ? { name: tiebreak } : tiebreak),
});

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

// tiebreaks are in priority order
export async function create(overrides: Partial<Insertable<Protocol>> & { tiebreaks?: TiebreakSpec[] } = {}) {
	const { tiebreaks, ...protocolOverrides } = overrides;
	const protocol = await db.insertInto('protocol')
		.values(createProtocolData(protocolOverrides))
		.returningAll()
		.executeTakeFirstOrThrow();

	if (tiebreaks?.length) {
		await db.insertInto('tiebreak')
			.values(tiebreaks.map((tiebreak, i) => tiebreakData(protocol.id, tiebreak, i + 1)))
			.execute();
	}

	return protocol;
}

// Adds a tiebreak after the protocol's existing ones. For children that point back
// at a protocol created earlier, like a protocol that is its own child
export async function addTiebreak(protocolId: number, tiebreak: TiebreakSpec) {
	const { last } = await db.selectFrom('tiebreak')
		.select(eb => eb.fn.max('priority').as('last'))
		.where('protocol', '=', protocolId)
		.executeTakeFirstOrThrow();

	return await db.insertInto('tiebreak')
		.values(tiebreakData(protocolId, tiebreak, Number(last ?? 0) + 1))
		.returningAll()
		.executeTakeFirstOrThrow();
}

export default {
	createProtocolData,
	mock,
	create,
	addTiebreak,
};
