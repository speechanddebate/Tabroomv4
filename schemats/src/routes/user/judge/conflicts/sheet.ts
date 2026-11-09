/*
 * Display rules for the judge's conflict sheet. The server decides what the judge may see and
 * mark; this only words it.
 */
import type { ConflictCandidate, JudgeConflict } from '@tabroom/types';

/** How a marked conflict reads: the entry code with its event, or the school or region name */
export function conflictLabel(conflict: Pick<JudgeConflict, 'type' | 'Entry' | 'School' | 'Region'>): string {
	switch (conflict.type) {
		case 'entry': {
			const code = conflict.Entry?.code ?? conflict.Entry?.name ?? 'An entry';
			return conflict.Entry?.Event.abbr ? `${code} (${conflict.Entry.Event.abbr})` : code;
		}
		case 'school': return conflict.School?.name ?? 'A school';
		case 'region': return conflict.Region?.name ?? 'A region';
	}
}

/** Why an entry can't be marked, or null when it can */
export function stateText(entry: Pick<ConflictCandidate, 'state' | 'School'>): string | null {
	switch (entry.state) {
		case 'open': return null;
		case 'entry': return 'Marked';
		case 'school': return `Conflicted through ${entry.School?.name ?? 'its school'}`;
		case 'ownSchool': return 'Your school';
	}
}

/**
 * Whom to ask about a conflict the judge can't remove: a non-removable registrant row is a
 * coach's; a row with no recorded enterer is classic's doing and only tab can sort it out
 */
export function removeHint(conflict: Pick<JudgeConflict, 'EnteredBy'>): string {
	return conflict.EnteredBy?.role === 'registrant'
		? 'Contact your coach to remove this conflict'
		: 'Contact tab staff to remove this conflict';
}

const studentNames = (entry: Pick<ConflictCandidate, 'Students'>): string[] =>
	entry.Students.map((student) => `${student.first ?? ''} ${student.last ?? ''}`.trim()).filter(Boolean);

export const studentList = (entry: Pick<ConflictCandidate, 'Students'>): string => studentNames(entry).join(', ');

type Searchable = Pick<ConflictCandidate, 'code' | 'name' | 'School' | 'Students'>;

/** Everything a judge might type to find an entry: its school, code, name, and competitors */
export const searchText = (entry: Searchable): string =>
	[entry.code, entry.name, entry.School?.name, ...studentNames(entry)].filter(Boolean).join(' ');

/** Whether every word of the filter appears somewhere in the entry's search text */
export function matchesFilter(entry: Searchable, filter: string): boolean {
	const text = searchText(entry).toLowerCase();
	return filter.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

export const filterCandidates = <T extends Searchable>(entries: T[], filter: string): T[] => entries.filter((entry) => matchesFilter(entry, filter));
