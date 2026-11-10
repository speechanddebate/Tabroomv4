import { describe, expect, it } from 'vitest';
import { affiliatedWith, conflictName } from './standing';

describe('conflictName', () => {
	it('names a school with its state and a person by name', () => {
		expect(conflictName({ Person: null, Chapter: { id: 1, name: 'Riverdale Prep', state: 'NY' } })).toBe('Riverdale Prep (NY)');
		expect(conflictName({ Person: null, Chapter: { id: 1, name: 'Riverdale Prep', state: null } })).toBe('Riverdale Prep');
		expect(conflictName({ Person: { id: 2, first: 'Quinn', last: 'Quill' }, Chapter: null })).toBe('Quinn Quill');
		expect(conflictName({ Person: { id: 2, first: null, last: null }, Chapter: null })).toBe('A person');
	});
});

describe('affiliatedWith', () => {
	it('lists the chapters judged or competed for', () => {
		expect(affiliatedWith({ Chapters: [{ id: 1, name: 'Riverdale Prep' }, { id: 2, name: 'Lincoln' }] })).toBe('Riverdale Prep, Lincoln');
		expect(affiliatedWith({ Chapters: [] })).toBe('No affiliations');
	});
});
