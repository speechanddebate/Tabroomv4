import { describe, expect, it } from 'vitest';
import { conflictName, judgedFor } from './standing';

describe('conflictName', () => {
	it('names a program with its state and a person by name', () => {
		expect(conflictName({ Person: null, Chapter: { id: 1, name: 'Riverdale Prep', state: 'NY' } })).toBe('Riverdale Prep (NY)');
		expect(conflictName({ Person: null, Chapter: { id: 1, name: 'Riverdale Prep', state: null } })).toBe('Riverdale Prep');
		expect(conflictName({ Person: { id: 2, first: 'Quinn', last: 'Quill' }, Chapter: null })).toBe('Quinn Quill');
		expect(conflictName({ Person: { id: 2, first: null, last: null }, Chapter: null })).toBe('A person');
	});
});

describe('judgedFor', () => {
	it('lists the chapters judged for', () => {
		expect(judgedFor({ Chapters: [{ id: 1, name: 'Riverdale Prep' }, { id: 2, name: 'Lincoln' }] })).toBe('Riverdale Prep, Lincoln');
		expect(judgedFor({ Chapters: [] })).toBe('Not registered to judge');
	});
});
