import { dueAff } from './dueAff.js';

// Entries 1 and 2 meeting on a panel in the given round, with entry 1 on the given side
const meeting = (panel: number, round: number, entry1Side: 1 | 2, flags: { panelBye?: number, bye?: number, forfeit?: number } = {}) => [
	{ panel, round, panelBye: 0, entry: 1, side: entry1Side, bye: 0, forfeit: 0, ...flags },
	{ panel, round, panelBye: 0, entry: 2, side: entry1Side === 1 ? 2 : 1, bye: 0, forfeit: 0, ...flags },
];

// The current panel, in round 5
const current = meeting(50, 5, 1);

describe('dueAff', () => {
	it('is null when the entries never met before', () => {
		expect(dueAff(current, 5)).toBeNull();
	});

	it('is the entry that was Neg last time', () => {
		expect(dueAff([...current, ...meeting(10, 1, 2)], 5)).toBe(1);
		expect(dueAff([...current, ...meeting(10, 1, 1)], 5)).toBe(2);
	});

	it('is the entry that was Neg more often', () => {
		expect(dueAff([...current, ...meeting(10, 1, 2), ...meeting(11, 2, 2), ...meeting(12, 3, 1)], 5)).toBe(1);
	});

	it('is null when they were Neg equally often', () => {
		expect(dueAff([...current, ...meeting(10, 1, 2), ...meeting(11, 2, 1)], 5)).toBeNull();
	});

	it('counts a panel once, however many judges it had', () => {
		const panelWithThreeJudges = [...meeting(10, 1, 2), ...meeting(10, 1, 2), ...meeting(10, 1, 2)];

		expect(dueAff([...current, ...panelWithThreeJudges, ...meeting(11, 2, 1), ...meeting(12, 3, 1)], 5)).toBe(2);
	});

	it('ignores the current and later rounds', () => {
		expect(dueAff([...meeting(50, 5, 2), ...meeting(60, 6, 2)], 5)).toBeNull();
	});

	it.each([
		['a bye panel', { panelBye: 1 }],
		['a bye', { bye: 1 }],
		['a forfeit', { forfeit: 1 }],
	])('ignores %s', (_label, flags) => {
		expect(dueAff([...current, ...meeting(10, 1, 2, flags)], 5)).toBeNull();
	});

	it('ignores a panel when only one of its ballots is a forfeit', () => {
		const [first, second] = meeting(10, 1, 2);

		expect(dueAff([...current, first, { ...second, forfeit: 1 }], 5)).toBeNull();
	});

	it('is null when the current round has no number', () => {
		expect(dueAff([...current, ...meeting(10, 1, 2)], null)).toBeNull();
	});
});
