import type { StandingConflict, StandingConflictRefusal, StandingConflictRequest } from '@tabroom/types';
import type { Database } from '../../data/database.js';
import type { SessionPerson } from '../../middleware/auth/types.js';
import changeLogRepo from '../../repos/changeLogRepo.js';
import chapterRepo from '../../repos/chapterRepo.js';
import conflictRepo from '../../repos/conflictRepo.js';
import personRepo from '../../repos/personRepo.js';
import tournRepo from '../../repos/tournRepo.js';
import { withTransaction } from '../../repos/utils/index.js';
import { removeConflictStrikes, updateConflictStrikes } from './updateConflictStrikes.js';

type Row = Awaited<ReturnType<typeof conflictRepo.getStandingConflicts>>[number];

const standingConflict = (row: Row): StandingConflict => ({
	id: row.id,
	person: Number(row.person),
	conflicted: row.conflicted,
	chapter: row.chapter,
	added_by: row.added_by,
	created_at: row.created_at?.toISOString() ?? null,
	Person: row.conflicted === null ? null : { id: row.conflicted, first: row.conflictedFirst, last: row.conflictedLast },
	Chapter: row.chapter === null ? null : { id: row.chapter, name: row.chapterName ?? '', state: row.chapterState },
});

export async function listStandingConflicts(db: Database, personId: number): Promise<StandingConflict[]> {
	return (await conflictRepo.getStandingConflicts(db, personId)).map(standingConflict);
}

export type AddOutcome =
	| { result: 'added'; conflict: StandingConflict }
	| { result: 'refused'; reason: StandingConflictRefusal }
	| { result: 'notFound' };

/**
 * The tournaments still to come, or running, that a standing conflict can touch: ones the person
 * judges or is entered at. Hidden ones too, as in classic, since nothing derives again when one is
 * published. A function because add and remove must loop the same set.
 */
const openTourns = async (db: Database, personId: number) => await tournRepo.getPersonTourns(db, personId, { endAfter: new Date(), unpublished: true, coach: false, tabber: false });

/**
 * Adds a standing conflict and, like classic's conflicts page on every load, derives its strikes
 * at each of the person's tournaments that hasn't ended.
 */
export async function addStandingConflict(db: Database, person: SessionPerson, request: StandingConflictRequest): Promise<AddOutcome> {
	if (request.person === person.id) return { result: 'refused', reason: 'self' };
	if (request.person !== undefined && !await personRepo.getPerson(db, request.person)) return { result: 'notFound' };
	if (request.chapter !== undefined && !await chapterRepo.getChapter(db, request.chapter)) return { result: 'notFound' };
	const existing = await conflictRepo.getConflicts(db, { person: person.id, conflicted: request.person, chapter: request.chapter });
	if (existing.length > 0) return { result: 'refused', reason: 'duplicate' };

	// one transaction: a row saved without its strikes could never get them, since a retry is refused as a duplicate
	const created = await withTransaction(db, async (trx) => {
		const conflict = await conflictRepo.createConflict(trx, { person: person.id, conflicted: request.person, chapter: request.chapter, added_by: person.id });
		const conflicts = await conflictRepo.getConflicts(trx, { involving: person.id });
		for (const tourn of await openTourns(trx, person.id)) {
			await updateConflictStrikes(trx, person.id, tourn.id, conflicts);
		}
		return conflict;
	});

	const [row] = await conflictRepo.getStandingConflicts(db, person.id, { ids: [created.id] });
	return { result: 'added', conflict: standingConflict(row) };
}

/**
 * Removes a standing conflict and the strikes it derived at tournaments that haven't ended, which
 * classic leaves behind; each tournament touched gets a conflicts log row. Null when the row isn't
 * the person's.
 */
export async function removeStandingConflict(db: Database, person: SessionPerson, conflictId: number): Promise<'removed' | null> {
	const [row] = await conflictRepo.getStandingConflicts(db, person.id, { ids: [conflictId] });
	if (!row) return null;
	const name = row.chapter !== null ? row.chapterName ?? '' : `${row.conflictedFirst ?? ''} ${row.conflictedLast ?? ''}`.trim();

	await withTransaction(db, async (trx) => {
		const remaining = (await conflictRepo.getConflicts(trx, { involving: person.id })).filter((other) => other.id !== row.id);
		for (const tourn of await openTourns(trx, person.id)) {
			const removed = await removeConflictStrikes(trx, person.id, tourn.id, { person: person.id, conflicted: row.conflicted, chapter: row.chapter }, remaining);
			if (removed === 0) continue;
			await changeLogRepo.createChangeLog(trx, {
				tag: 'conflicts',
				tourn: tourn.id,
				person: person.id,
				description: `Standing conflict with ${name} removed by ${person.email}: ${removed} conflict${removed === 1 ? '' : 's'} removed`,
			});
		}
		await conflictRepo.deleteConflict(trx, row.id);
	});
	return 'removed';
}
