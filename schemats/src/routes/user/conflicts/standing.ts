import type { ConflictPersonMatch, StandingConflict } from '@tabroom/types';
import { personName } from '$lib/helpers/text';

/** How a standing conflict reads: the program with its state, or the person */
export function conflictName(conflict: Pick<StandingConflict, 'Person' | 'Chapter'>): string {
	if (conflict.Chapter) return conflict.Chapter.state ? `${conflict.Chapter.name} (${conflict.Chapter.state})` : conflict.Chapter.name;
	return conflict.Person ? personName(conflict.Person) || 'A person' : 'A person';
}

/** Where a found person has judged, to tell namesakes apart */
export const judgedFor = (match: Pick<ConflictPersonMatch, 'Chapters'>): string =>
	match.Chapters.length > 0 ? match.Chapters.map((chapter) => chapter.name).join(', ') : 'Not registered to judge';
