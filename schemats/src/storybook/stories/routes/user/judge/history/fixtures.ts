import type { JudgeHistory, JudgeHistoryPage } from '$indexcards/schemas';

const divisions = ['Open', 'JV', 'Novice', 'Varsity'];

type RowOverrides = Omit<Partial<JudgeHistory>, 'Tourn'> & { Tourn?: Partial<JudgeHistory['Tourn']> };

const row = (id: number, { Tourn, ...overrides }: RowOverrides = {}): JudgeHistory => ({
	id,
	Tourn: {
		id: 1000 + id,
		name: `Invitational ${id}`,
		start: `2025-${String(((id - 1) % 12) + 1).padStart(2, '0')}-10T14:00:00.000Z`,
		end: `2025-${String(((id - 1) % 12) + 1).padStart(2, '0')}-11T22:00:00.000Z`,
		tz: 'America/Chicago',
		...Tourn,
	},
	Weekend: null,
	division: divisions[id % divisions.length],
	roundsJudged: id % 6,
	roundsObligated: 6,
	...overrides,
});

/** 120 tournaments, newest first, with the date edge cases up front */
export const createHistory = (count = 120): JudgeHistory[] =>
	Array.from({ length: count }, (_, i) => {
		const id = count - i;
		// 04:00Z is still the previous evening in Chicago, so this shows 3/13 - 15
		if (i === 0) return row(id, { Tourn: { name: 'Same Month Classic', start: '2026-03-14T04:00:00.000Z', end: '2026-03-16T04:00:00.000Z' } });
		if (i === 1) return row(id, { Tourn: { name: 'Cross Month Invitational', start: '2026-01-30T14:00:00.000Z', end: '2026-02-01T22:00:00.000Z', tz: 'UTC' } });
		if (i === 2) return row(id, {
			Tourn: { name: 'District Tournament', start: '2026-02-01T14:00:00.000Z', end: '2026-02-28T22:00:00.000Z' },
			Weekend: { id: 7, name: 'Weekend 2', start: '2026-02-20T14:00:00.000Z', end: '2026-02-21T22:00:00.000Z' },
		});
		return row(id);
	});

/** Slices a history the way the API does for a request's limit/offset */
export const pageOf = (all: JudgeHistory[], url: string): JudgeHistoryPage => {
	const params = new URL(url).searchParams;
	const offset = Number(params.get('offset') ?? 0);
	const limit = Number(params.get('limit') ?? 50);
	return { items: all.slice(offset, offset + limit), total: all.length };
};
