import { describe, expect, it } from 'vitest';
import type { ConflictCandidate } from '@tabroom/types';
import { conflictLabel, filterCandidates, removeHint, stateText, studentList } from './sheet';

const westlake = { id: 1811, name: 'Westlake' };
const candidate = (overrides: Partial<ConflictCandidate> = {}): ConflictCandidate => ({
	id: 1, code: 'Westlake BB', name: 'Westlake BB', event: 40, Event: { id: 40, name: 'Lincoln-Douglas', abbr: 'LD' }, category: 7,
	school: westlake.id, School: westlake, Students: [{ id: 9, first: 'Ana', last: 'Adams' }], state: 'open', ...overrides,
});

describe('conflictLabel', () => {
	it('names an entry by code and event, a school and a region by name', () => {
		expect(conflictLabel({ type: 'entry', Entry: { id: 1, code: 'Westlake BB', name: null, Event: { abbr: 'LD' } }, School: null, Region: null })).toBe('Westlake BB (LD)');
		expect(conflictLabel({ type: 'entry', Entry: { id: 1, code: null, name: 'Westlake BB', Event: { abbr: null } }, School: null, Region: null })).toBe('Westlake BB');
		expect(conflictLabel({ type: 'school', Entry: null, School: westlake, Region: null })).toBe('Westlake');
		expect(conflictLabel({ type: 'region', Entry: null, School: null, Region: { id: 3, name: 'North' } })).toBe('North');
	});
});

describe('removeHint', () => {
	it('names whoever can remove it', () => {
		expect(removeHint({ EnteredBy: { role: 'tab', first: null, last: null } })).toBe('Contact tab staff to remove this conflict');
		expect(removeHint({ EnteredBy: { role: 'registrant', first: 'Carl', last: 'Coach' } })).toBe('Contact your coach to remove this conflict');
		expect(removeHint({ EnteredBy: null })).toBe('Contact tab staff to remove this conflict');
	});
});

describe('stateText', () => {
	it('says why an entry is off the table, and nothing for an open one', () => {
		expect(stateText(candidate())).toBeNull();
		expect(stateText(candidate({ state: 'entry' }))).toBe('Marked');
		expect(stateText(candidate({ state: 'school' }))).toBe('Conflicted through Westlake');
		expect(stateText(candidate({ state: 'ownSchool' }))).toBe('Your school');
	});
});

describe('filterCandidates', () => {
	const entries = [
		candidate({ id: 1, code: 'Westlake BB' }),
		candidate({ id: 2, code: 'Riverdale CC', name: 'Riverdale CC', School: { id: 1812, name: 'Riverdale' }, Students: [{ id: 10, first: 'Ben', last: 'Brown' }] }),
		candidate({ id: 3, code: 'Westlake DD', name: 'Westlake DD', Students: [] }),
	];
	it('matches school, code, or a competitor, case-insensitively, needing every word', () => {
		expect(filterCandidates(entries, '').map((entry) => entry.id)).toEqual([1, 2, 3]);
		expect(filterCandidates(entries, 'westlake').map((entry) => entry.id)).toEqual([1, 3]);
		expect(filterCandidates(entries, 'brown').map((entry) => entry.id)).toEqual([2]);
		expect(filterCandidates(entries, 'Westlake dd').map((entry) => entry.id)).toEqual([3]);
		expect(filterCandidates(entries, 'nobody')).toEqual([]);
	});
});

describe('studentList', () => {
	it('joins the competitors by name and skips blanks', () => {
		expect(studentList(candidate({ Students: [{ id: 9, first: 'Ana', last: 'Adams' }, { id: 10, first: null, last: 'Brown' }] }))).toBe('Ana Adams, Brown');
		expect(studentList(candidate({ Students: [] }))).toBe('');
	});
});
