/*
 * Rules for a judge's conflict sheet, ported from classic's user/judge/judge_conflicts.mhtml.
 * Pure functions over rows the repos load; the SQL side of "which strikes a judge may see"
 * is strikeRepo's judgeVisible. Classic also lists the entries of any other category whose
 * pref pool holds the judge; no tournament since 2025 has used that, so the beta lists only
 * the judge's own category.
 */
/** Whether a person may remove a strike from the sheet: one they entered, or one declared from the judge's side (classic's conflictee flag) */
export function isRemovable(strike: { entered_by: number | null; conflictee: number }, personId: number): boolean {
	return strike.entered_by === personId || strike.conflictee === 1;
}

/**
 * One person's standing conflicts seen from one tournament: their own judge rows and entries, and
 * the judges, entries, and schools on the other side of those conflicts. `strikes` are the
 * tournament's existing rows on any of those judges.
 */
export type TournSides = {
	/** the person's judge rows at the tourn */
	judges: number[];
	/** the person's entries at the tourn */
	entries: number[];
	/** judges at the tourn linked to a person on the other side of a conflict */
	conflictedJudges: number[];
	/** entries at the tourn carrying a student linked to a person on the other side */
	conflictedEntries: number[];
	/** schools at the tourn of the chapters the person conflicted */
	conflictedSchools: number[];
	strikes: { id: number; judge: number | null; school: number | null; entry: number | null; conflict: number; registrant: number; conflictee: number; entered_by: number | null }[];
};

export type DerivedStrike = { judge: number; type: 'school' | 'entry'; school: number | null; entry: number | null };

// shared by derivedStrikes and strikesToRemove, which must agree on what one target is
const targetKey = (row: { judge: number | null; school: number | null; entry: number | null }) => `${row.judge}:${row.school ?? ''}:${row.entry ?? ''}`;

/**
 * Classic's person_conflict.mas: the strikes a person's standing conflicts imply at one tournament.
 * Their judge rows get a school strike per registered school of a conflicted chapter and an entry
 * strike per entry carrying a conflicted person; their entries get an entry strike on each judge
 * linked to a conflicted person. A target already marked as a registrant conflict is skipped.
 */
export function derivedStrikes(sides: TournSides): DerivedStrike[] {
	const marked = new Set(sides.strikes
		.filter((strike) => strike.conflict === 1 && strike.registrant === 1)
		.map(targetKey));
	const rows: DerivedStrike[] = [];
	const add = (row: DerivedStrike) => {
		if (marked.has(targetKey(row))) return;
		marked.add(targetKey(row));
		rows.push(row);
	};
	for (const judge of sides.judges) {
		for (const school of sides.conflictedSchools) add({ judge, type: 'school', school, entry: null });
		for (const entry of sides.conflictedEntries) add({ judge, type: 'entry', school: null, entry });
	}
	for (const judge of sides.conflictedJudges) {
		for (const entry of sides.entries) add({ judge, type: 'entry', school: null, entry });
	}
	return rows;
}

/**
 * The derived rows one standing conflict implied, given its sides. Strike rows carry no link to
 * the conflict that derived them and a hand-marked sheet row has the same flags, so only rows the
 * person entered are taken, and none that `remaining` (the sides of the other conflicts involving
 * them, a reciprocal one included) still implies. A row the person hand-marked on the same target
 * goes too.
 */
export function strikesToRemove(sides: TournSides, remaining: TournSides, personId: number): number[] {
	const stillImplied = new Set(derivedStrikes({ ...remaining, strikes: [] }).map(targetKey));
	const judges = new Set(sides.judges);
	const conflictedJudges = new Set(sides.conflictedJudges);
	const entries = new Set(sides.entries);
	const conflictedEntries = new Set(sides.conflictedEntries);
	const conflictedSchools = new Set(sides.conflictedSchools);
	return sides.strikes
		.filter((strike) => strike.conflict === 1 && strike.conflictee === 1 && strike.judge !== null)
		.filter((strike) => strike.entered_by === personId && !stillImplied.has(targetKey(strike)))
		.filter((strike) =>
			(judges.has(strike.judge!) && ((strike.school !== null && conflictedSchools.has(strike.school)) || (strike.entry !== null && conflictedEntries.has(strike.entry))))
			|| (conflictedJudges.has(strike.judge!) && strike.entry !== null && entries.has(strike.entry)))
		.map((strike) => strike.id);
}

export type CandidateState = 'open' | 'entry' | 'school' | 'ownSchool';

/** Whether the judge may still mark an entry, in classic's check order: marked, covered by its school, the judge's own school */
export function candidateState(
	entry: { id: number; school: number | null },
	judge: { school: number | null },
	strikes: { type: string | null; entry: number | null; school: number | null }[],
): CandidateState {
	if (strikes.some((strike) => strike.type === 'entry' && strike.entry === entry.id)) return 'entry';
	if (entry.school !== null && strikes.some((strike) => strike.type === 'school' && strike.school === entry.school)) return 'school';
	if (judge.school !== null && entry.school === judge.school) return 'ownSchool';
	return 'open';
}
