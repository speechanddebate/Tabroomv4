import factories from './index.js';
import type { Settings } from '../../api/repos/utils/index.js';
import type { FlipState, FlipStatus } from '../../api/services/flips/flipRules.js';

type FlipOverrides = {
	status?: FlipStatus;
	/** the current turn's deadline, five minutes out by default */
	flipAt?: Date;
	/** which entry won the toss */
	winner?: 'aff' | 'neg';
	flip?: FlipState;
	/** round flip_published, on by default */
	published?: boolean;
	roundType?: string;
	/** the round's timeslot, which public pages like the schematic need */
	timeslot?: number;
	/** event settings on top of flip_online */
	event?: Settings;
	tourn?: number;
	/** the aff and neg entries' schools; each gets its own school when unset */
	schools?: { aff?: number; neg?: number };
};

/**
 * A two-entry debate panel mid coin flip, with the panel, round and event settings written
 * the way classic's flip page and monitor write them. Shared by unit tests and e2e specs.
 */
export async function create(overrides: FlipOverrides = {}) {
	const tournId = overrides.tourn ?? (await factories.tourn.create()).id;
	const category = await factories.category.create({ tourn: tournId });
	const event = await factories.event.create({
		tourn: tournId,
		category: category.id,
		type: 'debate',
		settings: { flip_online: '1', ...overrides.event },
	});
	const round = await factories.round.create({
		event: event.id,
		name: 1,
		type: overrides.roundType ?? 'prelim',
		timeslot: overrides.timeslot,
		published: 1,
		settings: overrides.published === false ? {} : { flip_published: '1' },
	});

	const side = async (school: number | undefined) => factories.entry.create({
		event: event.id,
		school: school ?? (await factories.school.create({ tourn: tournId })).id,
	});
	const aff = await side(overrides.schools?.aff);
	const neg = await side(overrides.schools?.neg);
	const winner = overrides.winner === 'neg' ? neg : aff;

	const panel = await factories.panel.create({
		round: round.id,
		bye: 0,
		settings: {
			flip_status: overrides.status ?? 'winner',
			flip_at: overrides.flipAt ?? new Date(Date.now() + 5 * 60_000),
			flip_winner: String(winner.id),
			flip: overrides.flip ?? {},
		},
	});
	await factories.ballot.create({ panel: panel.id, entry: aff.id, side: 1 });
	await factories.ballot.create({ panel: panel.id, entry: neg.id, side: 2 });

	return { tourn: tournId, category, event, round, panel, aff, neg, winner };
}

export default {
	create,
};
