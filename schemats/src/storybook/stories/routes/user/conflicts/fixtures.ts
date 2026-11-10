import type { ConflictChapterMatch, ConflictPersonMatch, StandingConflict } from '@tabroom/types';

const riverdale = { id: 1812, name: 'Riverdale Prep', state: 'NY' };

export const quinn: StandingConflict = {
	id: 9101, person: 701, conflicted: 802, chapter: null, added_by: 701, created_at: '2026-09-01T15:00:00Z',
	Person: { id: 802, first: 'Quinn', last: 'Quill' }, Chapter: null,
};

export const conflicts: StandingConflict[] = [
	{ id: 9100, person: 701, conflicted: null, chapter: riverdale.id, added_by: 701, created_at: '2026-08-12T15:00:00Z', Person: null, Chapter: riverdale },
	quinn,
];

export const people: ConflictPersonMatch[] = [
	{ id: 802, first: 'Quinn', last: 'Quill', Chapters: [{ id: riverdale.id, name: riverdale.name }] },
	{ id: 803, first: 'Quincy', last: 'Quill', Chapters: [{ id: 1813, name: 'Plano East' }, { id: 1811, name: 'Westlake' }] },
	{ id: 804, first: 'Q', last: 'Quillen', Chapters: [] },
];

export const chapters: ConflictChapterMatch[] = [
	{ id: riverdale.id, name: 'Riverdale Prep', city: 'Riverdale', state: 'NY' },
	{ id: 1814, name: 'Riverdale High School', city: 'Riverdale', state: 'GA' },
];
