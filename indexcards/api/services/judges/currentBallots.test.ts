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
		roomJudgeUrl: null,
		roomNotes: 'back of the gym',
		event: 400,
		eventName: 'Lincoln Douglas',
		eventAbbr: 'LD',
		matchEventAbbr: null,
		eventType: 'debate',
		category: 500,
		tourn: 600,
		entry: 700,
		entryCode: 'AB',
		entryActive: 1,
		scoreTag: null,
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
			flight: null,
			status: 'not_started',
			start: start.toISOString(),
			deadline: end.toISOString(),
			roomId: 300,
			Room: { name: '101', joinable: false, hybrid: false, mapUrl: null },
			roomNotes: null,
			chair: false,
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
	it('shows published rounds and unpublished rounds released to judges, with room notes only when the round includes them', () => {
		const rows = [row({ panel: 1, round: 1, roundPublished: 1 }), row({ panel: 2, round: 2, roundPublished: 0 }), row({ panel: 3, round: 3, roundPublished: 0 })];
		const ballots = buildCurrentBallots(rows, context({ rounds: new Map<number, Record<string, string>>([[1, { include_room_notes: '1' }], [2, { judges_ballots_visible: '1' }]]) }));

		expect(ballots.map((ballot) => [ballot.id, ballot.roomNotes])).toEqual([[1, 'back of the gym'], [2, null]]);
	});

	// A two hour timeslot from 11:00 with two one hour flights
	it('runs each flight from its offset start until the next flight starts, the last until the timeslot ends', () => {
		const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
		const flights = (event: Record<string, string>, overrides: Partial<JudgePanelRow> = {}) => buildCurrentBallots(
			[row({ panel: 1, panelFlight: '1', roundFlighted: 2, ...overrides }), row({ panel: 2, panelFlight: '2', roundFlighted: 2, ...overrides })],
			context({ events: new Map([[400, event]]) }),
		).map((ballot) => [ballot.flight, ballot.start, ballot.deadline, ballot.end]);

		expect(flights({ flight_offset: '60', prelim_decision_deadline: '50' })).toEqual([[1, at(0), at(50), at(60)], [2, at(60), at(110), at(120)]]);
		expect(flights({ flight_offset: '60' })).toEqual([[1, at(0), at(60), at(60)], [2, at(60), at(120), at(120)]]);
		// an offset longer than the timeslot allows still ends the flight with the timeslot
		expect(flights({ flight_offset: '90' })).toEqual([[1, at(0), at(90), at(90)], [2, at(90), at(120), at(120)]]);
		expect(flights({})).toEqual([[1, at(0), at(120), at(120)], [2, at(0), at(120), at(120)]]);
		expect(flights({ flight_offset: '60' }, { roundFlighted: 0, panelFlight: '1' })).toEqual([[null, at(0), at(120), at(120)], [null, at(0), at(120), at(120)]]);
	});

	it('takes the elim deadline for elims and finals and the prelim one for every other type, else the flight end', () => {
		const deadline = (roundType: string | null, event: Record<string, string>) => buildCurrentBallots([row({ roundType })], context({ events: new Map([[400, event]]) }))[0].deadline;
		const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
		const both = { prelim_decision_deadline: '90', elim_decision_deadline: '100' };

		expect(deadline('prelim', both)).toBe(after(90));
		expect(deadline('highlow', both)).toBe(after(90));
		expect(deadline('snaked_prelim', both)).toBe(after(90));
		expect(deadline(null, both)).toBe(after(90));
		expect(deadline('elim', both)).toBe(after(100));
		expect(deadline('final', both)).toBe(after(100));
		expect(deadline('runoff', both)).toBe(after(90));
		expect(deadline('elim', { prelim_decision_deadline: '90' })).toBe(end.toISOString());
		expect(deadline('prelim', { elim_decision_deadline: '100' })).toBe(end.toISOString());
	});

	it('labels sides unless a flip is still open, and on elims and no_side_constraints events only once the flip is done', () => {
		const sides = (flipStatus: string | null, overrides: Partial<JudgePanelRow> = {}, event: Record<string, string> = {}) => buildCurrentBallots(
			[row({ side: 1, speakerorder: 1, ...overrides }), row({ id: 2, entry: 701, side: 2, speakerorder: 2, ...overrides })],
			context({
				events: new Map([[400, { online_mode: 'sync', aff_label: 'Pro', ...event }]]),
				panels: new Map<number, Record<string, string>>([[100, flipStatus ? { flip_status: flipStatus } : {}]]),
			}),
		)[0].Entries.map((entry) => [entry.side, entry.speakerOrder]);

		expect(sides(null)).toEqual([['Pro', 1], ['Neg', 2]]);
		expect(sides('done')).toEqual([['Pro', 1], ['Neg', 2]]);
		expect(sides('winner')).toEqual([[null, null], [null, null]]);
		expect(sides(null, { roundType: 'elim' })).toEqual([[null, null], [null, null]]);
		expect(sides('done', { roundType: 'elim' })).toEqual([['Pro', 1], ['Neg', 2]]);
		expect(sides(null, { roundType: 'elim' }, { sidelock_elims: '1' })).toEqual([['Pro', 1], ['Neg', 2]]);
		expect(sides(null, {}, { no_side_constraints: '1' })).toEqual([[null, null], [null, null]]);
		expect(sides('done', {}, { no_side_constraints: '1' })).toEqual([['Pro', 1], ['Neg', 2]]);
	});

	it('drops an audited panel until its flight ends, except for a congress or mock trial chair', () => {
		const listed = (overrides: Partial<JudgePanelRow>, ctx = context()) => buildCurrentBallots([row({ audit: 1, ...overrides })], ctx).length;
		const flighted = new Map([[400, { flight_offset: '30' }]]);

		expect(listed({})).toBe(0);
		expect(listed({ chair: 1 })).toBe(0);
		expect(listed({ eventType: 'congress' })).toBe(0);
		expect(listed({ eventType: 'congress', chair: 1 })).toBe(1);
		expect(listed({ eventType: 'mock_trial', chair: 1 })).toBe(1);
		expect(listed({}, context({ now: new Date('2026-03-07T14:00:00Z') }))).toBe(1);
		// flight 1 of 2 ended at 11:30, before now at 12:00
		expect(listed({ roundFlighted: 2 }, context({ events: flighted }))).toBe(1);
		expect(listed({ roundFlighted: 2, panelFlight: '2' }, context({ events: flighted }))).toBe(0);
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
		expect(buildCurrentBallots([row({ scoreTag: 'refute' })], ctx)[0].status).toBe('scored');
		expect(buildCurrentBallots([row({ audit: 1, eventType: 'congress', chair: 1 })], ctx)[0].status).toBe('confirmed');
	});

	describe('Room', () => {
		const room = (overrides: Partial<JudgePanelRow>, ctx: Partial<CurrentBallotContext> = {}) => buildCurrentBallots([row(overrides)], context(ctx))[0].Room;
		const events = (settings: Record<string, string>) => ({ events: new Map([[400, settings]]) });

		it('maps an in-person room by its url', () => {
			expect(room({ roomUrl: 'https://maps.example/101' }, events({}))).toEqual({ name: '101', joinable: false, hybrid: false, mapUrl: 'https://maps.example/101' });
			expect(room({}, events({ online_mode: 'none' }))).toEqual({ name: '101', joinable: false, hybrid: false, mapUrl: null });
		});

		it('joins a sync room by its judge url, its url, or the round override link', () => {
			const joinable = { name: '101', joinable: true, hybrid: false, mapUrl: null };

			expect(room({ roomJudgeUrl: 'https://meet.example/host' })).toEqual(joinable);
			expect(room({ roomUrl: 'https://meet.example/101' })).toEqual(joinable);
			expect(room({}, { rounds: new Map([[200, { override_link: 'https://meet.example/all' }]]) })).toEqual(joinable);
			expect(room({})).toEqual({ ...joinable, joinable: false });
		});

		it('names a Campus room after the section, in the matched event when the event shares rooms', () => {
			expect(room({}, events({ online_mode: 'nsda_campus' }))).toEqual({ name: 'LD A', joinable: true, hybrid: false, mapUrl: null });
			expect(room({ matchEventAbbr: 'CX' }, events({ online_mode: 'nsda_campus' }))).toEqual({ name: 'CX A', joinable: true, hybrid: false, mapUrl: null });
		});

		it('shows a hybrid Campus section as its in-person room with a map', () => {
			expect(room({ roomUrl: 'https://maps.example/101' }, { ...events({ online_mode: 'nsda_campus' }), panels: new Map([[100, { online_hybrid: '1' }]]) }))
				.toEqual({ name: '101', joinable: true, hybrid: true, mapUrl: 'https://maps.example/101' });
		});

		it('keeps a confirmed chair\'s room open until the end and closes it after', () => {
			const chair = { audit: 1, eventType: 'congress' as const, chair: 1, roomUrl: 'https://meet.example/101' };

			expect(room(chair)?.joinable).toBe(true);
			expect(room(chair, { now: new Date('2026-03-07T14:00:00Z') })?.joinable).toBe(false);
		});

		it('is null without a room unless the room is Campus', () => {
			expect(room({ room: null, roomName: null }, events({}))).toBeNull();
			expect(room({ room: null, roomName: null }, events({ online_mode: 'nsda_campus' }))).toEqual({ name: 'LD A', joinable: true, hybrid: false, mapUrl: null });
		});
	});
});

describe('settingsById', () => {
	it('keys the rows settings by id', () => {
		expect(settingsById([{ id: 1, settings: { a: '1' } }, { id: 2, settings: null }])).toEqual(new Map([[1, { a: '1' }], [2, null]]));
	});
});
