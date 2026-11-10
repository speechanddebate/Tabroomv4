/*
 * The port of classic's funclib/person_conflict.mas: a person's standing conflicts become strike
 * rows at a tournament. Classic runs it at registration time and whenever a judge conflict page
 * loads; the beta runs it when a standing conflict is saved, and runs the reverse when one is
 * removed, for every tournament that hasn't ended.
 */
import type { Database } from '../../data/database.js';
import entryRepo from '../../repos/entryRepo.js';
import judgeRepo from '../../repos/judgeRepo.js';
import schoolRepo from '../../repos/schoolRepo.js';
import strikeRepo from '../../repos/strikeRepo.js';
import { derivedStrikes, strikesToRemove, type TournSides } from './conflictRules.js';

type ConflictRow = { person: number | null; conflicted: number | null; chapter: number | null };

async function loadSides(db: Database, personId: number, tournId: number, conflicts: ConflictRow[]): Promise<TournSides> {
	const otherPeople = conflicts
		.map((conflict) => conflict.person === personId ? conflict.conflicted : conflict.person)
		.filter((id): id is number => id !== null);
	const chapters = conflicts
		.filter((conflict) => conflict.person === personId)
		.map((conflict) => conflict.chapter)
		.filter((id): id is number => id !== null);

	const [judges, conflictedJudges, entries, conflictedEntries, conflictedSchools] = await Promise.all([
		judgeRepo.getJudges(db, { person: personId, tourns: [tournId] }),
		judgeRepo.getJudges(db, { persons: otherPeople, tourns: [tournId] }),
		entryRepo.getEntries(db, { studentPersons: [personId], tourns: [tournId] }),
		entryRepo.getEntries(db, { studentPersons: otherPeople, tourns: [tournId] }),
		schoolRepo.getSchools(db, { tourn: tournId, chapters }),
	]);
	const strikes = await strikeRepo.getStrikes(db, { judges: [...judges, ...conflictedJudges].map((judge) => judge.id), tourn: tournId, types: ['school', 'entry'] });

	return {
		judges: judges.map((judge) => judge.id),
		entries: entries.map((entry) => entry.id),
		conflictedJudges: conflictedJudges.map((judge) => judge.id),
		conflictedEntries: conflictedEntries.map((entry) => entry.id),
		conflictedSchools: conflictedSchools.map((school) => school.id),
		strikes,
	};
}

/**
 * Writes the strikes the person's standing conflicts imply at the tournament; returns how many.
 * `conflicts` are the rows with the person on either side, loaded once by a caller looping tourns.
 */
export async function updateConflictStrikes(db: Database, personId: number, tournId: number, conflicts: ConflictRow[], enteredBy = personId): Promise<number> {
	if (conflicts.length === 0) return 0;
	const rows = derivedStrikes(await loadSides(db, personId, tournId, conflicts));
	await strikeRepo.createStrikes(db, rows.map((row) => ({
		...row,
		tourn: tournId,
		conflict: 1,
		registrant: 1,
		conflictee: 1,
		entered_by: enteredBy,
	})));
	return rows.length;
}

/**
 * Removes the derived strikes one standing conflict implied at the tournament; returns how many.
 * `remaining` are the other conflicts with the person on either side.
 */
export async function removeConflictStrikes(db: Database, personId: number, tournId: number, removed: ConflictRow, remaining: ConflictRow[]): Promise<number> {
	const ids = strikesToRemove(
		await loadSides(db, personId, tournId, [removed]),
		await loadSides(db, personId, tournId, remaining),
		personId,
	);
	if (ids.length > 0) await strikeRepo.deleteStrikes(db, ids);
	return ids.length;
}
