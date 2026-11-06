import { flipChoices, flipStatus, flipTurn, isFlipOnline, isFlipOpen, isFlipPending, nextFlip, parseFlip, type FlipState } from './flipRules.js';

const now = new Date('2026-11-06T14:00:00Z');
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);
const teamOrder = { flip_team_order: '1' };

describe('flipStatus', () => {
	it.each(['winner', 'loser', 'anyone', 'done'])('is %s when the panel is at that step', (status) => {
		expect(flipStatus({ settings: { flip_status: status } })).toBe(status);
	});

	it('is null before the flip_status isn\'t set', () => {
		expect(flipStatus({ settings: {} })).toBeNull();
		expect(flipStatus({ settings: null })).toBeNull();
	});

	it('is null for an invalid flip_status value', () => {
		expect(flipStatus({ settings: { flip_status: 'second' } })).toBeNull();
	});
});

describe('parseFlip', () => {
	it('reads the JSON string MariaDB returns, or an object as is', () => {
		expect(parseFlip('{"side_locked": 1}')).toEqual({ side_locked: 1 });
		expect(parseFlip({ order_locked: 1 })).toEqual({ order_locked: 1 });
	});

	it.each([null, undefined, '', '{not json', '3', '"text"', '[1, 2]', [1, 2], 3])('is null for %s', (value) => {
		expect(parseFlip(value)).toBeNull();
	});
});

describe('isFlipPending', () => {
	it.each(['winner', 'loser', 'anyone'])('is true for %s', (status) => {
		expect(isFlipPending(status)).toBe(true);
	});

	it.each(['done', null, undefined, ''])('is false for %s', (status) => {
		expect(isFlipPending(status)).toBe(false);
	});
});

describe('isFlipOnline', () => {
	it('follows the event\'s flip_online', () => {
		expect(isFlipOnline({ flip_online: '1' })).toBe(true);
		expect(isFlipOnline({ flip_online: '0' })).toBe(false);
		expect(isFlipOnline({})).toBe(false);
		expect(isFlipOnline(null)).toBe(false);
	});
});

describe('isFlipOpen', () => {
	const open = { round: { flip_published: '1' }, bye: 0, status: 'winner', ended: false, audited: false };

	it('is open when released, paired, pending, running and unaudited', () => {
		expect(isFlipOpen(open)).toBe(true);
	});

	it.each([
		['flip_published missing', { round: {} }],
		['flip_published off', { round: { flip_published: '0' } }],
		['no round settings', { round: null }],
		['a bye', { bye: 1 }],
		['done', { status: 'done' }],
		['not started', { status: null }],
		['the tourn ended', { ended: true }],
		['the ballot audited', { audited: true }],
	])('is closed when %s', (_name, change) => {
		expect(isFlipOpen({ ...open, ...change })).toBe(false);
	});
});

describe('flipTurn', () => {
	const winner = 10;
	const loser = 11;

	it.each([
		['winner', winner, 'mine'],
		['winner', loser, 'theirs'],
		['loser', winner, 'theirs'],
		['loser', loser, 'mine'],
		['anyone', winner, 'either'],
		['anyone', loser, 'either'],
	] as const)('in %s, entry %i gets %s', (status, entry, turn) => {
		expect(flipTurn(status, winner, entry)).toBe(turn);
	});

	it.each(['done', null])('is null when the status is %s', (status) => {
		expect(flipTurn(status, winner, winner)).toBeNull();
		expect(flipTurn(status, winner, loser)).toBeNull();
	});
});

describe('flipChoices', () => {
	it('offers side only without team order', () => {
		expect(flipChoices({}, {})).toEqual({ side: true, order: false });
	});

	it('offers side and order with team order', () => {
		expect(flipChoices(teamOrder, null)).toEqual({ side: true, order: true });
	});

	it('closes each locked property', () => {
		expect(flipChoices(teamOrder, { side_locked: 1 })).toEqual({ side: false, order: true });
		expect(flipChoices(teamOrder, { order_locked: 1 })).toEqual({ side: true, order: false });
	});

	it('leaves nothing open once both are locked', () => {
		expect(flipChoices(teamOrder, { side_locked: 1, order_locked: 2 })).toEqual({ side: false, order: false });
	});
});

describe('nextFlip', () => {
	describe('winner', () => {
		it('is done once both are locked', () => {
			expect(nextFlip('winner', { side_locked: 1, order_locked: 1 }, 'choice', teamOrder, now).status).toBe('done');
		});

		describe('with team order', () => {
			it('goes to loser after a choice', () => {
				expect(nextFlip('winner', { side_locked: 1 }, 'choice', teamOrder, now).status).toBe('loser');
			});

			it('goes to loser on a timeout with one lock', () => {
				expect(nextFlip('winner', { order_locked: 1 }, 'timeout', teamOrder, now).status).toBe('loser');
			});

			it('goes to anyone on a timeout with no locks when flip_anyone_chooses is on', () => {
				expect(nextFlip('winner', {}, 'timeout', { ...teamOrder, flip_anyone_chooses: '1' }, now).status).toBe('anyone');
			});

			it('goes to loser on a timeout with no locks otherwise', () => {
				expect(nextFlip('winner', {}, 'timeout', teamOrder, now).status).toBe('loser');
			});
		});

		describe('without team order', () => {
			it('is done after a side choice', () => {
				expect(nextFlip('winner', { side_locked: 1 }, 'choice', {}, now).status).toBe('done');
			});

			it('goes to anyone on a timeout when flip_anyone_chooses is on', () => {
				expect(nextFlip('winner', {}, 'timeout', { flip_anyone_chooses: '1' }, now).status).toBe('anyone');
			});

			it('goes to loser on a timeout otherwise', () => {
				expect(nextFlip('winner', null, 'timeout', {}, now).status).toBe('loser');
			});

			it('counts order as locked, as classic writes it', () => {
				expect(nextFlip('winner', null, 'timeout', {}, now).flip.order_locked).toBe(1);
			});
		});
	});

	describe('loser', () => {
		it('is done once both are locked', () => {
			expect(nextFlip('loser', { side_locked: 1, order_locked: 1 }, 'choice', teamOrder, now).status).toBe('done');
		});

		it('hands back to the winner after a choice', () => {
			expect(nextFlip('loser', { side_locked: 1 }, 'choice', teamOrder, now).status).toBe('winner');
		});

		it('goes to anyone on a timeout', () => {
			expect(nextFlip('loser', {}, 'timeout', teamOrder, now).status).toBe('anyone');
		});
	});

	describe('anyone', () => {
		const random = (...values: number[]) => () => values.shift() ?? 0;

		it('picks side and order on a timeout with nothing locked', () => {
			const step = nextFlip('anyone', {}, 'timeout', teamOrder, now, random(0.9, 0.9));

			expect(step.status).toBe('done');
			expect(step.flip).toMatchObject({
				side_locked: 1,
				side_auto_chosen: 1,
				side_chosen_at: '2026-11-06 14:00:00',
				order_locked: 1,
				order_auto_chosen: 1,
				order_chosen_at: '2026-11-06 14:00:00',
			});
		});

		it('picks only order when side is locked', () => {
			const step = nextFlip('anyone', { side_locked: 1 }, 'timeout', teamOrder, now, random(0.9));

			expect(step.autopick).toEqual({ swapSides: false, secondSpeaker: 2 });
			expect(step.flip.side_auto_chosen).toBeUndefined();
		});

		it('never picks order without team order', () => {
			const step = nextFlip('anyone', {}, 'timeout', {}, now, random(0.9, 0.1));

			expect(step.autopick).toEqual({ swapSides: false, secondSpeaker: null });
			expect(step.flip.order_auto_chosen).toBeUndefined();
		});

		it('picks nothing when both are already locked', () => {
			const step = nextFlip('anyone', { side_locked: 1, order_locked: 1 }, 'choice', teamOrder, now);

			expect(step.status).toBe('done');
			expect(step.autopick).toBeNull();
		});

		it('fills the rest and is done after a choice', () => {
			const step = nextFlip('anyone', { side_locked: 1, side_chosen: 'Aff' }, 'choice', teamOrder, now, random(0.1));

			expect(step.status).toBe('done');
			expect(step.flip).toMatchObject({ side_chosen: 'Aff', order_locked: 1, order_auto_chosen: 1 });
		});

		it.each([
			[0.1, true],
			[0.5, false],
			[0.9, false],
		])('swaps sides when random is %d: %s', (value, swapped) => {
			expect(nextFlip('anyone', {}, 'timeout', {}, now, random(value)).autopick?.swapSides).toBe(swapped);
		});

		it.each([
			[0.1, 1],
			[0.9, 2],
		])('random %d puts side %i second', (value, side) => {
			expect(nextFlip('anyone', { side_locked: 1 }, 'timeout', teamOrder, now, random(value)).autopick?.secondSpeaker).toBe(side);
		});
	});

	it.each([
		['winner', 'timeout'],
		['loser', 'choice'],
	] as const)('picks nothing at random in %s', (status, trigger) => {
		expect(nextFlip(status, {}, trigger, teamOrder, now).autopick).toBeNull();
	});

	it('sets the next deadline flip_deadline minutes out', () => {
		expect(nextFlip('winner', {}, 'timeout', { flip_deadline: '3' }, now).flipAt).toEqual(minutes(3));
	});

	it.each([undefined, '0', ''])('defaults the deadline to 5 minutes for %s', (deadline) => {
		expect(nextFlip('winner', {}, 'timeout', { flip_deadline: deadline as string }, now).flipAt).toEqual(minutes(5));
	});

	it('doesn\'t change the input flip', () => {
		const flip: FlipState = { side_locked: 1 };
		nextFlip('anyone', flip, 'timeout', teamOrder, now, () => 0.1);

		expect(flip).toEqual({ side_locked: 1 });
	});
});
