import { entryScores, panelWinner, scoreCell, sideLabel, studentScores, type PanelScore } from './judgeHistory.js';

const score = (overrides: Partial<PanelScore>): PanelScore => ({
	tag: 'winloss',
	value: 1,
	student: 0,
	ballot: 1,
	judge: 1,
	entry: 10,
	panel: 100,
	side: 1,
	forfeit: 0,
	bye: 0,
	...overrides,
});

const aff = { id: 10, code: '101', name: 'Northview AB' };
const neg = { id: 20, code: '202', name: 'Southview CD' };

// Three judges: ballots 1-3; judge 1 and 2 vote aff, judge 3 votes neg
const splitPanel = (overrides: Partial<PanelScore> = {}) => [
	score({ ballot: 1, judge: 1, entry: 10, side: 1, value: 1, ...overrides }),
	score({ ballot: 2, judge: 1, entry: 20, side: 2, value: 0, ...overrides }),
	score({ ballot: 3, judge: 2, entry: 10, side: 1, value: 1, ...overrides }),
	score({ ballot: 4, judge: 2, entry: 20, side: 2, value: 0, ...overrides }),
	score({ ballot: 5, judge: 3, entry: 10, side: 1, value: 0, ...overrides }),
	score({ ballot: 6, judge: 3, entry: 20, side: 2, value: 1, ...overrides }),
];

describe('sideLabel', () => {
	it('uses the event labels for two-sided debate', () => {
		expect(sideLabel('debate', 1, null, null, null)).toBe('Aff');
		expect(sideLabel('debate', 2, null, 'Pro', 'Con')).toBe('Con');
		expect(sideLabel('debate', 0, null, null, null)).toBeNull();
	});
	it('uses the BP position for WUDC', () => {
		expect(sideLabel('wudc', 0, 3, null, null)).toBe('2G');
		expect(sideLabel('wudc', 0, 0, null, null)).toBeNull();
	});
});

describe('scoreCell', () => {
	it('maps a losing ballot to L and keeps rank and points', () => {
		expect(scoreCell([
			score({ tag: 'winloss', value: 0 }),
			score({ tag: 'rank', value: 2 }),
			score({ tag: 'point', value: 28.5 }),
		])).toEqual({ winloss: 'L', rank: 2, point: 28.5 });
	});
	it('is empty without scores', () => {
		expect(scoreCell([])).toEqual({ winloss: null, rank: null, point: null });
	});
});

describe('entryScores', () => {
	it("takes only this judge's entry-level scores", () => {
		const scores = [...splitPanel(), score({ ballot: 1, judge: 1, entry: 10, student: 7, tag: 'point', value: 29 })];
		expect(entryScores(scores, 10, 3, 'debate')).toEqual({ winloss: 'L', rank: null, point: null });
		expect(entryScores(scores, 10, 1, 'debate').point).toBeNull();
	});
	it("takes every judge's scores for WUDC", () => {
		const scores = [
			score({ judge: 1, entry: 10, tag: 'rank', value: 2 }),
			score({ judge: 2, entry: 10, tag: 'rank', value: 1 }),
		];
		expect(entryScores(scores, 10, 1, 'wudc').rank).toBe(1);
	});
});

describe('studentScores', () => {
	it("takes this judge's scores for one speaker", () => {
		const scores = [
			score({ judge: 1, entry: 10, student: 7, tag: 'point', value: 28 }),
			score({ judge: 2, entry: 10, student: 7, tag: 'point', value: 27 }),
			score({ judge: 1, entry: 10, student: 8, tag: 'point', value: 29 }),
		];
		expect(studentScores(scores, 10, 7, 1)).toEqual({ winloss: null, rank: null, point: 28 });
	});
});

describe('panelWinner', () => {
	it('names the entry with more ballots and lists the larger count first', () => {
		expect(panelWinner(splitPanel(), [aff, neg], 'elim', 'debate', false))
			.toEqual({ entry: 10, code: '101', name: 'Northview AB', record: '2-1' });
	});
	it('reports a neg winner the same way round', () => {
		const scores = splitPanel().map(s => ({ ...s, value: s.value ? 0 : 1 }));
		expect(panelWinner(scores, [aff, neg], 'final', 'debate', false)?.record).toBe('2-1');
		expect(panelWinner(scores, [aff, neg], 'final', 'debate', false)?.entry).toBe(20);
	});
	it('ignores forfeit and bye ballots when picking the winner', () => {
		const scores = splitPanel().map(s => s.ballot <= 4 ? { ...s, forfeit: 1 } : s);
		expect(panelWinner(scores, [aff, neg], 'elim', 'debate', false)?.entry).toBe(20);
	});
	it('is null on a tie, outside elims, for speech, or when speakers were scored', () => {
		const tied = splitPanel().slice(0, 4).map(s => s.judge === 2 ? { ...s, value: s.value ? 0 : 1 } : s);
		expect(panelWinner(tied, [aff, neg], 'elim', 'debate', false)).toBeNull();
		expect(panelWinner(splitPanel(), [aff, neg], 'prelim', 'debate', false)).toBeNull();
		expect(panelWinner(splitPanel(), [aff, neg], 'elim', 'speech', false)).toBeNull();
		expect(panelWinner(splitPanel(), [aff, neg], 'elim', 'debate', true)).toBeNull();
	});
});
