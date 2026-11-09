/*
 * Rules for a judge's conflict sheet, ported from classic's user/judge/judge_conflicts.mhtml.
 * Pure functions over rows the repos load; the SQL side of "which strikes a judge may see"
 * is strikeRepo's judgeVisible. Classic also lists the entries of any other category whose
 * pref pool holds the judge; no tournament since 2025 has used that, so the beta lists only
 * the judge's own category (Ryan, 2026-11-09).
 */
/** Whether a person may remove a strike from the sheet: one they entered, or one declared from the judge's side (classic's conflictee flag) */
export function isRemovable(strike: { entered_by: number | null; conflictee: number }, personId: number): boolean {
	return strike.entered_by === personId || strike.conflictee === 1;
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
