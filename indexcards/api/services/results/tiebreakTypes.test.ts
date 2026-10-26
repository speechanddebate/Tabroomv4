import factories from '../../../tests/factories/index.js';
import type { TiebreakSpec } from '../../../tests/factories/protocol.js';
import type { Settings } from '../../repos/utils/index.js';
import { tiebreakTypes } from './tiebreakTypes.js';

// tiebreakTypes always sets every flag. Tests spread the true ones over this
const none = {
	speech: false,
	tv: false,
	rank: false,
	entryWinloss: false,
	entryRank: false,
	bestPO: false,
	winloss: false,
	point: false,
	refute: false,
};

type RoundOptions = {
	tourn?: { id: number },
	eventType?: string,
	eventSettings?: Settings,
	protocol?: number | null,
	type?: string,
	name?: number,
	settings?: Settings,
};

// A round in a new event. Pass tourn to use protocols made for it
const makeRound = async ({ tourn, eventType = 'debate', eventSettings, protocol = null, type = 'prelim', name = 1, settings }: RoundOptions = {}) => {
	const tournId = tourn?.id ?? (await factories.tourn.create()).id;
	const event = await factories.event.create({ tourn: tournId, type: eventType, settings: eventSettings });
	return await factories.round.create({ event: event.id, protocol, type, name, settings });
};

const makeProtocol = (tourn: { id: number }, tiebreaks: TiebreakSpec[] = []) => factories.protocol.create({ tourn: tourn.id, tiebreaks });

// The types for a round whose protocol has these tiebreaks
const typesFor = async (tiebreaks: TiebreakSpec[], options: Omit<RoundOptions, 'protocol'> = {}) => {
	const tourn = options.tourn ?? await factories.tourn.create();
	const protocol = await makeProtocol(tourn, tiebreaks);
	const round = await makeRound({ ...options, tourn, protocol: protocol.id });
	return await tiebreakTypes({ roundId: round.id });
};

describe('tiebreakTypes', () => {
	describe('tiebreak names', () => {
		it.each([
			['ranks', 'rank'],
			['reciprocals', 'rank'],
			['opp_ranks', 'rank'],
			['chair_ranks', 'rank'],
			['non_chair_ranks', 'rank'],
			['downs', 'rank'],
			['preponderance', 'rank'],
			['judgepref', 'rank'],
			['entry_vote_one', 'entryWinloss'],
			['entry_vote_all', 'entryWinloss'],
			['student_rank', 'entryRank'],
			['student_recip', 'entryRank'],
			['best_po', 'bestPO'],
			['opp_wins', 'winloss'],
			['opp_ballots', 'winloss'],
			['winloss', 'winloss'],
			['ballots', 'winloss'],
			['losses', 'winloss'],
			['headtohead', 'winloss'],
			['points', 'point'],
			['opp_points', 'point'],
			['po_points', 'point'],
			['three_way_point', 'point'],
			['judgevar', 'point'],
			['judgevar2', 'point'],
		] as const)('maps %s to %s', async (name, flag) => {
			expect(await typesFor([name])).toEqual({ ...none, [flag]: true });
		});

		it.each(['coinflip', 'seed'])('maps %s to nothing', async (name) => {
			expect(await typesFor([name])).toEqual(none);
		});

		it('sets nothing for a protocol with no tiebreaks', async () => {
			expect(await typesFor([])).toEqual(none);
		});
	});

	describe('count', () => {
		it.each(['prelim', 'elim'])('counts all and previous tiebreaks in a %s', async (type) => {
			const tiebreaks = [{ name: 'points', count: 'all' }, { name: 'winloss', count: 'previous' }];

			expect(await typesFor(tiebreaks, { type })).toEqual({ ...none, point: true, winloss: true });
		});

		it.each([
			['prelim', 'prelim', true],
			['prelim', 'elim', false],
			['elim', 'elim', true],
			['elim', 'prelim', false],
			['final', 'final', true],
			['final', 'elim', false],
		] as const)('a tiebreak counted %s in a %s round counts: %s', async (count, type, counts) => {
			expect(await typesFor([{ name: 'points', count }], { type })).toEqual({ ...none, point: counts });
		});

		it.each(['snaked_prelim', 'highhigh', 'highlow'])('treats a %s round as a prelim', async (type) => {
			expect(await typesFor([{ name: 'points', count: 'prelim' }], { type })).toEqual({ ...none, point: true });
		});

		it('treats a preset round as a prelim', async () => {
			expect(await typesFor([{ name: 'points', count: 'prelim' }], { type: 'preset' })).toEqual({ ...none, point: true });
		});

		it('counts a specific tiebreak in its round', async () => {
			expect(await typesFor([{ name: 'points', count: 'specific', count_round: 3 }], { name: 3 })).toEqual({ ...none, point: true });
		});

		it('skips a specific tiebreak in other rounds', async () => {
			expect(await typesFor([{ name: 'points', count: 'specific', count_round: 3 }], { name: 2 })).toEqual(none);
		});

		it('only counts the tiebreaks that match the round', async () => {
			const tiebreaks = [
				{ name: 'winloss', count: 'all' },
				{ name: 'points', count: 'elim' },
				{ name: 'ranks', count: 'prelim' },
				{ name: 'best_po', count: 'specific', count_round: 4 },
			];

			expect(await typesFor(tiebreaks, { type: 'prelim', name: 1 })).toEqual({ ...none, winloss: true, rank: true });
		});
	});

	describe('event type', () => {
		it('adds refute to points in WSDC', async () => {
			expect(await typesFor(['points'], { eventType: 'wsdc' })).toEqual({ ...none, point: true, refute: true });
		});

		it('doesn\'t add refute to points outside WSDC', async () => {
			expect(await typesFor(['points'], { eventType: 'debate' })).toEqual({ ...none, point: true });
		});

		it('doesn\'t add refute in WSDC without points', async () => {
			expect(await typesFor(['winloss'], { eventType: 'wsdc' })).toEqual({ ...none, winloss: true });
		});

		it('adds speech in Congress', async () => {
			expect(await typesFor(['ranks'], { eventType: 'congress' })).toEqual({ ...none, rank: true, speech: true });
		});

		it('adds speech in Congress with no tiebreaks', async () => {
			expect(await typesFor([], { eventType: 'congress' })).toEqual({ ...none, speech: true });
		});

		it('adds points and refute in WSDC elims with busywork_points_in_elims', async () => {
			const types = await typesFor([{ name: 'points', count: 'prelim' }, 'winloss'], {
				eventType: 'wsdc',
				eventSettings: { busywork_points_in_elims: '1' },
				type: 'elim',
			});

			expect(types).toEqual({ ...none, winloss: true, point: true, refute: true });
		});
	});

	describe('time violations', () => {
		it('sets tv for a tiebreak with violation', async () => {
			expect(await typesFor([{ name: 'ranks', violation: 1 }])).toEqual({ ...none, rank: true, tv: true });
		});

		it('skips violation on a tiebreak that doesn\'t count', async () => {
			expect(await typesFor([{ name: 'ranks', violation: 1, count: 'elim' }], { type: 'prelim' })).toEqual(none);
		});

		it('leaves tv false without violation', async () => {
			expect(await typesFor(['ranks'])).toEqual({ ...none, rank: true });
		});
	});

	describe('child protocols', () => {
		it('adds what a child counts', async () => {
			const tourn = await factories.tourn.create();
			const child = await makeProtocol(tourn, ['points']);

			expect(await typesFor([{ name: 'ranks', child: child.id }], { tourn })).toEqual({ ...none, rank: true, point: true });
		});

		it('follows nested children', async () => {
			const tourn = await factories.tourn.create();
			const grandchild = await makeProtocol(tourn, ['best_po']);
			const child = await makeProtocol(tourn, [{ name: 'ranks', child: grandchild.id }]);

			expect(await typesFor([{ name: 'points', child: child.id }], { tourn })).toEqual({ ...none, point: true, rank: true, bestPO: true });
		});

		// tiebreak_types.mas stops at children once it has points, wins and ranks
		it('follows children after points, wins and ranks are set', async () => {
			const tourn = await factories.tourn.create();
			const child = await makeProtocol(tourn, [{ name: 'ranks', violation: 1 }]);
			const tiebreaks = ['winloss', 'points', { name: 'ranks', child: child.id }];

			expect(await typesFor(tiebreaks, { tourn })).toEqual({ ...none, winloss: true, point: true, rank: true, tv: true });
		});

		it('applies the count to a child\'s tiebreaks', async () => {
			const tourn = await factories.tourn.create();
			const child = await makeProtocol(tourn, [{ name: 'points', count: 'elim' }]);

			expect(await typesFor([{ name: 'ranks', child: child.id }], { tourn, type: 'prelim' })).toEqual({ ...none, rank: true });
		});

		it('skips the child of a tiebreak that doesn\'t count', async () => {
			const tourn = await factories.tourn.create();
			const child = await makeProtocol(tourn, ['points']);
			const tiebreaks = ['winloss', { name: 'ranks', count: 'elim', child: child.id }];

			expect(await typesFor(tiebreaks, { tourn, type: 'prelim' })).toEqual({ ...none, winloss: true });
		});

		it('stops at a protocol that is its own child', async () => {
			const tourn = await factories.tourn.create();
			const protocol = await makeProtocol(tourn, ['winloss']);
			await factories.protocol.addTiebreak(protocol.id, { name: 'ranks', child: protocol.id });
			const round = await makeRound({ tourn, protocol: protocol.id });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true, rank: true });
		});

		it('stops at a cycle between two protocols', async () => {
			const tourn = await factories.tourn.create();
			const first = await makeProtocol(tourn, ['winloss']);
			const second = await makeProtocol(tourn, ['points']);
			await factories.protocol.addTiebreak(first.id, { name: 'ranks', child: second.id });
			await factories.protocol.addTiebreak(second.id, { name: 'downs', child: first.id });
			const round = await makeRound({ tourn, protocol: first.id });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true, point: true, rank: true });
		});

		it('ignores a child that doesn\'t exist', async () => {
			expect(await typesFor([{ name: 'ranks', child: 999_999_999 }])).toEqual({ ...none, rank: true });
		});

		it('ignores a child in another tourn', async () => {
			const tourn = await factories.tourn.create();
			const other = await factories.tourn.create();
			const child = await makeProtocol(other, ['points']);

			expect(await typesFor([{ name: 'ranks', child: child.id }], { tourn })).toEqual({ ...none, rank: true });
		});
	});

	describe('event protocols', () => {
		it.each([
			'speaker_protocol',
			'po_protocol',
			'final_bowl_protocol',
			'leadership_protocol',
		])('adds the event\'s %s', async (tag) => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const extra = await makeProtocol(tourn, ['ranks']);
			const round = await makeRound({ tourn, protocol: own.id, eventSettings: { [tag]: String(extra.id) } });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true, rank: true });
		});

		it('adds every event protocol, not just the first', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const speaker = await makeProtocol(tourn, ['points']);
			const po = await makeProtocol(tourn, ['best_po']);
			const finalBowl = await makeProtocol(tourn, ['ranks']);
			const leadership = await makeProtocol(tourn, ['student_rank']);
			const round = await makeRound({
				tourn,
				protocol: own.id,
				eventSettings: {
					speaker_protocol: String(speaker.id),
					po_protocol: String(po.id),
					final_bowl_protocol: String(finalBowl.id),
					leadership_protocol: String(leadership.id),
				},
			});

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({
				...none,
				winloss: true,
				point: true,
				bestPO: true,
				rank: true,
				entryRank: true,
			});
		});

		it('adds the round\'s leadership_protocol alongside the event\'s', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const roundLeadership = await makeProtocol(tourn, ['entry_vote_one']);
			const eventLeadership = await makeProtocol(tourn, ['student_rank']);
			const round = await makeRound({
				tourn,
				protocol: own.id,
				settings: { leadership_protocol: String(roundLeadership.id) },
				eventSettings: { leadership_protocol: String(eventLeadership.id) },
			});

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true, entryWinloss: true, entryRank: true });
		});

		// The count decides, so a speaker tiebreak counted in all rounds applies in elims too
		it('adds the speaker protocol in elims', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const speaker = await makeProtocol(tourn, [{ name: 'points', count: 'all' }]);
			const round = await makeRound({ tourn, protocol: own.id, type: 'elim', eventSettings: { speaker_protocol: String(speaker.id) } });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true, point: true });
		});

		it('skips speaker tiebreaks counted in prelims during elims', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const speaker = await makeProtocol(tourn, [{ name: 'points', count: 'prelim' }]);
			const round = await makeRound({ tourn, protocol: own.id, type: 'elim', eventSettings: { speaker_protocol: String(speaker.id) } });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true });
		});

		it('ignores a setting for a protocol that doesn\'t exist', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const round = await makeRound({ tourn, protocol: own.id, eventSettings: { speaker_protocol: '999999999' } });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true });
		});

		it('ignores an event protocol in another tourn', async () => {
			const tourn = await factories.tourn.create();
			const other = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const speaker = await makeProtocol(other, ['points']);
			const round = await makeRound({ tourn, protocol: own.id, eventSettings: { speaker_protocol: String(speaker.id) } });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true });
		});

		it('ignores other events\' protocols', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const speaker = await makeProtocol(tourn, ['points']);
			await factories.event.create({ tourn: tourn.id, type: 'debate', settings: { speaker_protocol: String(speaker.id) } });
			const round = await makeRound({ tourn, protocol: own.id });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, winloss: true });
		});

		it('uses event protocols for a round with no protocol', async () => {
			const tourn = await factories.tourn.create();
			const speaker = await makeProtocol(tourn, ['points']);
			const round = await makeRound({ tourn, eventSettings: { speaker_protocol: String(speaker.id) } });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual({ ...none, point: true });
		});

		it('sets nothing for a round with no protocols', async () => {
			const round = await makeRound();

			expect(await tiebreakTypes({ roundId: round.id })).toEqual(none);
		});

		it('counts nothing for a round whose protocol is in another tourn', async () => {
			const tourn = await factories.tourn.create();
			const other = await factories.tourn.create();
			const protocol = await makeProtocol(other, ['winloss']);
			const round = await makeRound({ tourn, protocol: protocol.id });

			expect(await tiebreakTypes({ roundId: round.id })).toEqual(none);
		});
	});

	describe('arguments', () => {
		it('uses only the given protocol, in the round\'s context', async () => {
			const tourn = await factories.tourn.create();
			const own = await makeProtocol(tourn, ['winloss']);
			const speaker = await makeProtocol(tourn, ['ranks']);
			const given = await makeProtocol(tourn, [{ name: 'points', count: 'prelim' }]);
			const round = await makeRound({
				tourn,
				eventType: 'wsdc',
				protocol: own.id,
				eventSettings: { speaker_protocol: String(speaker.id) },
			});

			expect(await tiebreakTypes({ roundId: round.id, protocolId: given.id })).toEqual({ ...none, point: true, refute: true });
		});

		it('counts nothing for a protocol in another tourn', async () => {
			const other = await factories.tourn.create();
			const given = await makeProtocol(other, ['points']);
			const round = await makeRound();

			expect(await tiebreakTypes({ roundId: round.id, protocolId: given.id })).toEqual(none);
		});

		it('throws for a round that doesn\'t exist', async () => {
			await expect(tiebreakTypes({ roundId: 999_999_999 })).rejects.toThrow();
		});

		it('throws for a protocol that doesn\'t exist', async () => {
			const round = await makeRound();

			await expect(tiebreakTypes({ roundId: round.id, protocolId: 999_999_999 })).rejects.toThrow();
		});
	});
});
