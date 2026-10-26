// Translation of tiebreak_types.mas from legacy. Given a round, delivers the
// kinds of scores its tiebreakers need to figure, telling us what to ask for
// on ballots etc. Each flag says what is needed, not who enters it: judge
// ballots ignore the student vote flags (entryWinloss, entryRank).

import { db } from '../../data/database.js';
import { getRound } from '../../repos/roundRepo.js';
import { getEvent } from '../../repos/eventRepo.js';
import { getProtocol, getProtocols } from '../../repos/protocolRepo.js';
import { isOn } from '../ballots/ballotRules.js';

// True means some counted tiebreak needs that score. tiebreakTypes always sets
// every key, but callers building their own can leave the false ones out
export type Counted = {
	speech?: boolean,
	tv?: boolean,
	rank?: boolean,
	entryWinloss?: boolean,
	entryRank?: boolean,
	bestPO?: boolean,
	winloss?: boolean,
	point?: boolean,
	refute?: boolean,
};

// Round types that count prelim tiebreaks
const PRELIM_TYPES = ['preset', 'snaked_prelim', 'highhigh', 'highlow'];

// Event settings naming protocols for the event's awards, which rank on this
// round's scores too
const EVENT_PROTOCOL_SETTINGS = [
	'leadership_protocol',
	'final_bowl_protocol',
	'po_protocol',
	'speaker_protocol',
];

const RANK_TIEBREAKS = [
	'ranks',
	'reciprocals',
	'opp_ranks',
	'chair_ranks',
	'non_chair_ranks',
	'downs',
	'preponderance',
	'judgepref',
];

const WINLOSS_TIEBREAKS = [
	'opp_wins',
	'opp_ballots',
	'winloss',
	'ballots',
	'losses',
	'headtohead',
];

const POINT_TIEBREAKS = [
	'points',
	'opp_points',
	'po_points',
	'three_way_point',
	'judgevar',
	'judgevar2',
];

// Without protocolId, uses the round's protocol plus its leadership_protocol
// setting and the event's award protocols. With protocolId, uses only that
// protocol, counted as of this round
export const tiebreakTypes = async ({ roundId, protocolId }: {
	roundId: number,
	protocolId?: number,
}): Promise<Counted> => {

	// Ballots and results can be entered before a round is published
	const round = await getRound(db, roundId, { unpublished: true, settings: ['leadership_protocol'] });

	if (!round) {
		throw new Error(`Round with ID ${roundId} not found`);
	}

	const event = round.event
		? await getEvent(db, round.event, { settings: ['busywork_points_in_elims', ...EVENT_PROTOCOL_SETTINGS] })
		: undefined;

	const roundType = PRELIM_TYPES.includes(round.type ?? '') ? 'prelim' : round.type;
	const wsdc = event?.type === 'wsdc';

	let queue: number[];

	if (protocolId) {
		if (!await getProtocol(db, protocolId, { noTiebreaks: true })) {
			throw new Error(`Protocol with ID ${protocolId} not found`);
		}
		queue = [protocolId];
	} else {
		queue = [
			round.protocol,
			round.settings?.leadership_protocol,
			...EVENT_PROTOCOL_SETTINGS.map(tag => event?.settings?.[tag]),
		].map(Number).filter(id => id > 0);
	}

	const counted: Counted = {
		speech: event?.type === 'congress',
		tv: false,
		rank: false,
		entryWinloss: false,
		entryRank: false,
		bestPO: false,
		winloss: false,
		point: false,
		refute: false,
	};

	if (!event?.tourn) {
		return counted;
	}

	// A tiebreak with a child is a composite, ranked within each section by the
	// child protocol, so the child's scores are needed too. Children can loop
	queue = [...new Set(queue)];
	const done = new Set(queue);

	while (queue.length) {
		const ids = queue;
		queue = [];

		for (const protocol of await getProtocols(db, { protocolIds: ids, tourn: event.tourn })) {
			for (const tiebreak of protocol.Tiebreaks ?? []) {

				if (
					tiebreak.count !== 'all'
					&& tiebreak.count !== 'previous'
					&& tiebreak.count !== roundType
					&& !(tiebreak.count === 'specific' && tiebreak.count_round === round.name)
				) {
					continue;
				}

				const name = tiebreak.name ?? '';

				if (tiebreak.violation) {
					counted.tv = true;
				}

				if (RANK_TIEBREAKS.includes(name)) {
					counted.rank = true;
				}

				if (['entry_vote_one', 'entry_vote_all'].includes(name)) {
					counted.entryWinloss = true;
				}

				if (['student_rank', 'student_recip'].includes(name)) {
					counted.entryRank = true;
				}

				if (name === 'best_po') {
					counted.bestPO = true;
				}

				if (WINLOSS_TIEBREAKS.includes(name)) {
					counted.winloss = true;
				}

				if (POINT_TIEBREAKS.includes(name)) {
					counted.point = true;
					if (wsdc) counted.refute = true;
				}

				if (tiebreak.child && !done.has(tiebreak.child)) {
					done.add(tiebreak.child);
					queue.push(tiebreak.child);
				}
			}
		}
	}

	if (wsdc && isOn(event?.settings?.busywork_points_in_elims)) {
		counted.point = true;
		counted.refute = true;
	}

	return counted;
};
