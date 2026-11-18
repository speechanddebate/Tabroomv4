// Rows and columns for the debate scoring table (ballot.mhtml 1655-2587).
// One row per speaker; the entry's cells span its speakers' rows. Both are built from the
// context only, never from what the judge has entered, so typing doesn't rebuild the table
// and remount the inputs.

import type { Snippet } from 'svelte';
import type { BallotStudent, DebateBallotContext } from '@tabroom/types';
import { renderSnippet } from '@tanstack/svelte-table';
import { createAppColumnHelper } from '#lib/components/utils/table.hook.ts';

export type ScoringRow = {
	ballot: number;
	code: string | null;
	sideLabel: string;
	// How many other entries in the time slot share a student with this one
	doubled: number;
	// null for an entry with no speakers, so it still gets a row
	student: BallotStudent | null;
};

// Snippets declared by the scoring component, so their inputs can write to its draft
export type ScoringCells = {
	entry: Snippet<[ScoringRow]>;
	speaker: Snippet<[ScoringRow]>;
	points: Snippet<[ScoringRow]>;
};

export function studentName(student: { first?: string | null; last?: string | null }): string {
	return [student.first, student.last].filter(Boolean).join(' ');
}

export function sideLabel(context: DebateBallotContext, side: number): string {
	return side === 1 ? context.debate.affLabel : context.debate.negLabel;
}

// The heading over the sides column (ballot.mhtml 1674-1686)
export function sidesHeading(context: DebateBallotContext): string {
	switch (context.debate.sides) {
		case 'flip':
			return context.debate.flipStatus === 'done' ? 'FLIP COMPLETE' : 'FLIP INCOMPLETE';
		case 'pick':
			return 'Select Side';
		default:
			return 'Sides Set';
	}
}

/** One row per speaker, entries in side order and speakers in speaking order, as the context sends them */
export function scoringRows(context: DebateBallotContext): ScoringRow[] {
	return context.Entries.flatMap<ScoringRow>((entry) => {
		const row = {
			ballot: entry.ballot,
			code: entry.code,
			sideLabel: sideLabel(context, entry.side),
			doubled: entry.doubled,
		};
		return entry.Students.length > 0
			? entry.Students.map((student) => ({ ...row, student }))
			: [{ ...row, student: null }];
	});
}

export function scoringRowId(row: ScoringRow): string {
	return row.student ? `student-${row.student.id}` : `ballot-${row.ballot}`;
}

const helper = createAppColumnHelper<ScoringRow>();

export function scoringColumns(context: DebateBallotContext, cells: ScoringCells) {
	return helper.columns([
		// Both entry columns access the ballot, so an entry's rows hold equal values and span
		helper.accessor('ballot', {
			id: 'side',
			header: sidesHeading(context),
			size: 110,
			enableResizing: false,
			spanRows: true,
			cell: (info) => info.row.original.sideLabel,
			meta: { cellClass: 'text-center font-semibold' },
		}),
		helper.accessor('ballot', {
			id: 'entry',
			header: 'Entry',
			spanRows: true,
			cell: (info) => renderSnippet(cells.entry, info.row.original),
			meta: { cellClass: 'font-semibold' },
		}),
		helper.display({
			id: 'speaker',
			header: 'Speaker',
			cell: (info) => renderSnippet(cells.speaker, info.row.original),
		}),
		...(context.scoring.points
			? [
				helper.display({
					id: 'points',
					header: 'Points',
					size: 120,
					enableResizing: false,
					cell: (info) => renderSnippet(cells.points, info.row.original),
					// Not truncated, so the input's focus ring shows
					meta: { truncate: false, cellClass: 'py-1' },
				}),
			]
			: []),
	]);
}
