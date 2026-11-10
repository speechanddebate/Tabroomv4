import { candidateState, derivedStrikes, isRemovable, strikesToRemove, type TournSides } from './conflictRules.js';

const JO = 7;

const strike = (id: number, judge: number, target: { school?: number; entry?: number }, flags: Partial<{ conflict: number; registrant: number; conflictee: number; entered_by: number }> = {}) => ({
	id, judge, school: target.school ?? null, entry: target.entry ?? null, conflict: 1, registrant: 1, conflictee: 1, entered_by: JO, ...flags,
});

// Jo (person 7) judges (judge 1) and competes (entry 10) at a tourn where she conflicted chapter C (school 30)
// and person Q, who judges (judge 2) and whose student is on entry 20
const sides = (strikes: TournSides['strikes'] = []): TournSides => ({
	judges: [1], entries: [10], conflictedJudges: [2], conflictedEntries: [20], conflictedSchools: [30], strikes,
});

describe('derivedStrikes', () => {
	it('strikes her judge off the chapter\'s school and Q\'s entry, and Q\'s judge off her entry', () => {
		expect(derivedStrikes(sides())).toEqual([
			{ judge: 1, type: 'school', school: 30, entry: null },
			{ judge: 1, type: 'entry', school: null, entry: 20 },
			{ judge: 2, type: 'entry', school: null, entry: 10 },
		]);
	});
	it('skips a target already marked as a registrant conflict, but not a tab strike on it', () => {
		expect(derivedStrikes(sides([strike(5, 1, { school: 30 }), strike(6, 2, { entry: 10 }, { conflict: 0, registrant: 0 })]))).toEqual([
			{ judge: 1, type: 'entry', school: null, entry: 20 },
			{ judge: 2, type: 'entry', school: null, entry: 10 },
		]);
	});
	it('does nothing for a person with no rows at the tourn', () => {
		expect(derivedStrikes({ ...sides(), judges: [], entries: [] })).toEqual([]);
	});
});

describe('strikesToRemove', () => {
	const none: TournSides = { judges: [], entries: [], conflictedJudges: [], conflictedEntries: [], conflictedSchools: [], strikes: [] };
	it('picks the derived rows on both sides and leaves hand-entered and unrelated ones', () => {
		const rows = [
			strike(1, 1, { school: 30 }),
			strike(2, 1, { entry: 20 }),
			strike(3, 2, { entry: 10 }),
			strike(4, 1, { entry: 99 }),
			strike(5, 1, { school: 30 }, { conflictee: 0 }),
			strike(6, 2, { entry: 10 }, { conflict: 0 }),
		];
		expect(strikesToRemove(sides(rows), none, JO)).toEqual([1, 2, 3]);
	});
	it('leaves a row someone else entered, such as Q marking her entry on their own sheet', () => {
		expect(strikesToRemove(sides([strike(1, 2, { entry: 10 }, { entered_by: 8 }), strike(2, 1, { entry: 20 })]), none, JO)).toEqual([2]);
	});
	it('leaves a row another conflict involving her still implies, such as Q\'s standing conflict with her', () => {
		const rows = [strike(1, 1, { school: 30 }), strike(2, 1, { entry: 20 }), strike(3, 2, { entry: 10 })];
		expect(strikesToRemove(sides(rows), { ...none, judges: [1], entries: [10], conflictedJudges: [2], conflictedEntries: [20] }, JO)).toEqual([1]);
	});
});

describe('conflictRules', () => {
	describe('isRemovable', () => {
		it('allows the person who entered the row', () => {
			expect(isRemovable({ entered_by: 5, conflictee: 0 }, 5)).toBe(true);
		});
		it('allows a row declared from the judge side, whoever entered it', () => {
			expect(isRemovable({ entered_by: 9, conflictee: 1 }, 5)).toBe(true);
			expect(isRemovable({ entered_by: null, conflictee: 1 }, 5)).toBe(true);
		});
		it('refuses a coach or tab row the person did not enter', () => {
			expect(isRemovable({ entered_by: 9, conflictee: 0 }, 5)).toBe(false);
			expect(isRemovable({ entered_by: null, conflictee: 0 }, 5)).toBe(false);
		});
	});

	describe('candidateState', () => {
		const judge = { school: 10 };
		const strikes = [
			{ type: 'entry', entry: 100, school: null },
			{ type: 'school', entry: null, school: 20 },
		];
		it('marks a struck entry, then one covered by its school, then the judge\'s own school', () => {
			expect(candidateState({ id: 100, school: 20 }, judge, strikes)).toBe('entry');
			expect(candidateState({ id: 101, school: 20 }, judge, strikes)).toBe('school');
			expect(candidateState({ id: 102, school: 10 }, judge, strikes)).toBe('ownSchool');
		});
		it('leaves the rest open, including entries with no school for a hired judge', () => {
			expect(candidateState({ id: 103, school: 30 }, judge, strikes)).toBe('open');
			expect(candidateState({ id: 104, school: null }, { school: null }, strikes)).toBe('open');
		});
	});
});
