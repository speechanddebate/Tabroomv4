import type { JudgeHistory, JudgeHistoryPage, JudgeHistoryPanel, JudgeTournHistory, JudgeTournRecord } from '$indexcards/schemas';

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

export const tourn: JudgeTournHistory['Tourn'] = {
	id: 1001,
	name: 'Same Month Classic',
	webname: 'samemonth',
	start: '2026-03-14T04:00:00.000Z',
	end: '2026-03-16T04:00:00.000Z',
	tz: 'America/Chicago',
};

const debatePanel = (id: number, overrides: Partial<JudgeHistoryPanel> = {}): JudgeHistoryPanel => ({
	id,
	flight: null,
	// 15:00Z is 10:00 AM in Chicago
	start: '2026-03-14T15:00:00.000Z',
	Round: { id: 100 + id, name: id, label: null, type: 'prelim' },
	Event: { id: 7, abbr: 'LD', type: 'debate' },
	Room: { id: 50 + id, name: `Room ${200 + id}` },
	Entries: [
		{ id: id * 10 + 1, code: `${id}01`, name: 'Northview AB', side: 'Aff', speakerOrder: null },
		{ id: id * 10 + 2, code: `${id}02`, name: 'Southview CD', side: 'Neg', speakerOrder: null },
	],
	...overrides,
});

export const schoolJudge: JudgeTournRecord = {
	id: 501,
	code: '42A',
	obligation: 4,
	hired: 2,
	roundsJudged: 5,
	flightsJudged: 7,
	School: { id: 9, name: 'Northview High School' },
	Category: { id: 3, name: 'Lincoln-Douglas', abbr: 'LD' },
	Panels: [
		debatePanel(1),
		debatePanel(2, { flight: 2, Round: { id: 102, name: 2, label: null, type: 'prelim' } }),
		debatePanel(3, { Room: null, Round: { id: 103, name: 3, label: 'Quarterfinals', type: 'elim' } }),
	],
};

export const volunteerJudge: JudgeTournRecord = {
	id: 502,
	code: null,
	obligation: 0,
	hired: 0,
	roundsJudged: 2,
	flightsJudged: 2,
	School: null,
	Category: { id: 4, name: 'Speech', abbr: 'SP' },
	Panels: [
		debatePanel(4, {
			Event: { id: 8, abbr: 'OO', type: 'speech' },
			Entries: [
				{ id: 41, code: '401', name: 'Alex Jordan', side: null, speakerOrder: 1 },
				{ id: 42, code: '402', name: 'Sam Lee', side: null, speakerOrder: 2 },
			],
		}),
	],
};

export const createTournHistory = (Judges: JudgeTournRecord[] = [schoolJudge]): JudgeTournHistory => ({ Tourn: tourn, Judges });

/** Slices a history the way the API does for a request's limit/offset */
export const pageOf = (all: JudgeHistory[], url: string): JudgeHistoryPage => {
	const params = new URL(url).searchParams;
	const offset = Number(params.get('offset') ?? 0);
	const limit = Number(params.get('limit') ?? 50);
	return { items: all.slice(offset, offset + limit), total: all.length };
};
