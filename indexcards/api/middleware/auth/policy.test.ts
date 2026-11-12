import { policy } from './policy.js';

// The policy table is the spec, so these don't restate it. They guard its shape and the
// deliberate, non-obvious decisions a casual edit could reverse
const rules = Object.entries(policy as Record<string, Record<string, string[]>>)
	.flatMap(([resource, actions]) => Object.entries(actions).map(([action, names]) => ({ rule: `${resource}.${action}`, names })));

const usedBy = (relation: string) => rules.filter(({ names }) => names.includes(relation)).map(({ rule }) => rule);

describe('hierarchy', () => {
	// whoever can act through the first relation can act through the second, so a rule listing one lists both
	const implies: [string, string][] = [
		['eventTab', 'tournTab'],
		['categoryTab', 'tournTab'],
	];
	// rules that deliberately break an implication, each with its reason
	const exceptions: Record<string, string> = {};

	it.each(implies)('every rule that lists %s also lists %s', (relation, parent) => {
		const missing = rules
			.filter(({ rule, names }) => names.includes(relation) && !names.includes(parent) && !(rule in exceptions))
			.map(({ rule }) => rule);
		expect(missing).toEqual([]);
	});
});

describe('edge cases', () => {
	it('category staff reach judges, not events, rounds, panels, or ballots, as in classic', () => {
		const reached = [...usedBy('categoryTab'), ...usedBy('categoryChecker')];
		expect(reached.filter(rule => /^(event|round|panel|ballot)\./.test(rule))).toEqual([]);
	});

	it('circuit admins read the tourn and nothing below it; they are not its staff', () => {
		const tournTree = usedBy('circuitAdmin').filter(rule => !/^(circuit|region)\./.test(rule));
		expect(tournTree).toEqual(['tourn.read']);
	});

	it('tourn.check is tourn-wide tab and checkers only, not event or category checkers', () => {
		expect(policy.tourn.check).not.toContain('tournStaff');
	});

	it('prefs-only coaches do prefs and see the chapter pages that lead to them', () => {
		expect(usedBy('prefsCoach').toSorted()).toEqual(['chapter.prefs', 'chapter.read', 'entry.prefs']);
	});

	it('school contacts see the school dashboard and nothing else', () => {
		expect(usedBy('schoolContact')).toEqual(['school.dashboard']);
	});

	it('event and category staff and checkers stay out of school pages', () => {
		// any checker relation, or eventTab/categoryTab, e.g. 'tournChecker' or 'eventTab'
		expect(Object.values(policy.school).flat().filter(relation => /Checker$|^(event|category)Tab$/.test(relation))).toEqual([]);
	});

	it('only tourn-wide owners and tabbers write the tourn itself', () => {
		expect(policy.tourn.write).toEqual(['tournTab']);
	});
});
