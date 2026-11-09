import { candidateState, isRemovable } from './conflictRules.js';

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
