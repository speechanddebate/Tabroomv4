import { buildCurrentBallots, settingsById, type CurrentBallotContext, type JudgePanelRow } from './currentBallots.js';

const now = new Date('2026-03-07T12:00:00Z');
const start = new Date('2026-03-07T11:00:00Z');
const end = new Date('2026-03-07T13:00:00Z');

function row(overrides: Partial<JudgePanelRow> = {}): JudgePanelRow {
	return {
		id: 1,
		judge: 10,
		side: 1,
		speakerorder: 0,
		audit: 0,
		judge_started: null,
		chair: 0,
		panel: 100,
		panelLetter: 'A',
		panelFlight: '1',
		round: 200,
		roundName: 1,
		roundLabel: null,
		roundType: 'prelim',
		roundPublished: 1,
		roundFlighted: 1,
		roundStart: null,
		timeslotStart: start,
		timeslotEnd: end,
		room: 300,
		roomName: '101',
		roomUrl: null,
		roomNotes: 'back of the gym',
		event: 400,
		eventName: 'Lincoln Douglas',
		eventAbbr: 'LD',
		eventType: 'debate',
		category: 500,
		tourn: 600,
		entry: 700,
		entryCode: 'AB',
		entryActive: 1,
		scored: 0,
		...overrides,
	} as JudgePanelRow;
}

function context(overrides: Partial<CurrentBallotContext> = {}): CurrentBallotContext {
	return {
		now,
		tourns: new Map([[600, { tz: 'America/Chicago', settings: { legion: '0' } }]]),
		events: new Map([[400, { online_mode: 'sync', aff_label: 'Pro' }]]),
		rounds: new Map(),
		panels: new Map(),
		...overrides,
	};
}

describe('buildCurrentBallots', () => {
	it('builds one ballot per panel from its rows', () => {
		const ballots = buildCurrentBallots([row({ entry: 700, entryCode: 'AB', side: 1 }), row({ id: 2, entry: 701, entryCode: 'CD', side: 2 })], context());

		expect(ballots).toHaveLength(1);
		expect(ballots[0]).toMatchObject({
			id: 100,
			name: 1,
			flight: 1,
			status: 'not_started',
			start: start.toISOString(),
			deadline: end.toISOString(),
			roomId: 300,
			Room: null,
			roomNotes: null,
			chair: false,
			audited: false,
			tourn: 600,
			TournTz: 'America/Chicago',
			eventType: 'debate',
			onlineMode: 'sync',
			JudgeId: 10,
			RoundId: 200,
			Entries: [{ id: 700, code: 'AB', side: 'Pro', speakerOrder: 0 }, { id: 701, code: 'CD', side: 'Neg', speakerOrder: 0 }],
		});
	});

	// Classic's rule: published, or released to judges only (judges_ballots_visible, "Publish ballots but not schematic")
	it('shows published rounds and unpublished rounds released to judges, with room notes only when released', () => {
		const rows = [row({ panel: 1, round: 1, roundPublished: 1 }), row({ panel: 2, round: 2, roundPublished: 0 }), row({ panel: 3, round: 3, roundPublished: 0 })];
		const ballots = buildCurrentBallots(rows, context({ rounds: new Map([[2, { judges_ballots_visible: '1' }]]) }));

		expect(ballots.map((ballot) => [ballot.id, ballot.roomNotes])).toEqual([[1, null], [2, 'back of the gym']]);
	});

	it('starts each flight later by the flight offset when the round is flighted', () => {
		const ballots = buildCurrentBallots([row({ panelFlight: '2', roundStart: start }), row({ panel: 101, panelFlight: '2', roundFlighted: 0 })], context({ events: new Map([[400, { flight_offset: '50' }]]) }));

		expect(ballots[0]).toMatchObject({ flight: 2, start: new Date(start.getTime() + 50 * 60_000).toISOString(), deadline: new Date(end.getTime() + 50 * 60_000).toISOString() });
		expect(ballots[1]).toMatchObject({ flight: null, start: start.toISOString() });
	});

	it('labels sides unless a flip is still open', () => {
		const sides = (flipStatus: string | null) => buildCurrentBallots(
			[row({ side: 1 }), row({ id: 2, entry: 701, side: 2 })],
			context({ panels: new Map<number, Record<string, string>>([[100, flipStatus ? { flip_status: flipStatus } : {}]]) }),
		)[0].Entries.map((entry) => entry.side);

		expect(sides(null)).toEqual(['Pro', 'Neg']);
		expect(sides('done')).toEqual(['Pro', 'Neg']);
		expect(sides('winner')).toEqual([null, null]);
	});

	it('drops an audited panel until the slot ends, except for chairs and for mock trial and congress', () => {
		expect(buildCurrentBallots([row({ audit: 1 })], context())).toHaveLength(0);
		expect(buildCurrentBallots([row({ audit: 1, chair: 1 })], context())).toHaveLength(1);
		expect(buildCurrentBallots([row({ audit: 1, eventType: 'congress' })], context())).toHaveLength(1);
		expect(buildCurrentBallots([row({ audit: 1 })], context({ now: new Date('2026-03-07T14:00:00Z') }))).toHaveLength(1);
	});

	it('drops async panels past their deadline and inactive entries', () => {
		expect(buildCurrentBallots([row()], context({ events: new Map([[400, { online_mode: 'async' }]]), now: new Date('2026-03-07T14:00:00Z') }))).toHaveLength(0);
		expect(buildCurrentBallots([row({ entryActive: 0 })], context())).toHaveLength(0);
	});

	it('reports the ballot status and the event and tourn flags', () => {
		const ctx = context({
			events: new Map([[400, { online_ballots: '1', start_button: 'Go', start_button_text: 'When ready' }]]),
			tourns: new Map([[600, { tz: 'UTC', settings: { legion: '1' } }]]),
			panels: new Map([[100, { show_async: '1' }]]),
		});

		expect(buildCurrentBallots([row({ judge_started: start })], ctx)[0]).toMatchObject({
			status: 'started', onlineBallots: true, legion: true, show_async: true, startText: 'Go', ballotText: 'When ready', TournTz: 'UTC',
		});
		expect(buildCurrentBallots([row({ scored: 1 })], ctx)[0].status).toBe('scored');
	});
});

describe('settingsById', () => {
	it('keys the rows settings by id', () => {
		expect(settingsById([{ id: 1, settings: { a: '1' } }, { id: 2, settings: null }])).toEqual(new Map([[1, { a: '1' }], [2, null]]));
	});
});
