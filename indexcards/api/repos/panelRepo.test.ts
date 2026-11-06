import panelRepo from './panelRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('panelRepo', () => {
	describe('buildPanelQuery', () => {
		it('includes settings when requested', async () => {
			const panel = await factories.panel.create();

			const panelResult = await panelRepo.getPanel(
				db,
				panel.id,
				{ settings: true }
			);

			expect(panelResult).toBeDefined();
			expect(panelResult!.settings).toBeDefined();
		});
	});
	describe('getPanel', () => {
		it('retrieves panel by id', async () => {
			const panelData = factories.panel.createPanelData();
			const created = await panelRepo.createPanel(db, panelData);
			expect(created).toBeDefined();
		});
	});
	describe('getMeetings', () => {
		// Entries a and b on a panel in round 3
		const setup = async () => {
			const event = await factories.event.create({ type: 'debate' });
			const [round1, round3, round4] = await Promise.all([1, 3, 4].map(name => factories.round.create({ event: event.id, name })));
			const a = await factories.entry.create({ event: event.id });
			const b = await factories.entry.create({ event: event.id });
			const c = await factories.entry.create({ event: event.id });

			const panelWith = async (round: number, sides: [number, number][], panel: Record<string, unknown> = {}, ballot: Record<string, unknown> = {}) => {
				const created = await factories.panel.create({ round, ...panel });
				for (const [entry, side] of sides) {
					await factories.ballot.create({ panel: created.id, entry, side, ...ballot });
				}
				return created;
			};

			const current = await panelWith(round3.id, [[a.id, 1], [b.id, 2]]);
			return { round1, round3, round4, a, b, c, current, panelWith };
		};

		it('returns every panel where both entries met, with round, sides and bye and forfeit flags', async () => {
			const { round1, round4, a, b, current, panelWith } = await setup();
			const earlier = await panelWith(round1.id, [[a.id, 2], [b.id, 1]], { bye: 1 }, { forfeit: 1 });
			const later = await panelWith(round4.id, [[a.id, 1], [b.id, 2]]);

			const meetings = (await panelRepo.getMeetings(db, [current.id])).get(current.id);

			expect(meetings).toHaveLength(6);
			expect(meetings).toEqual(expect.arrayContaining([
				{ panel: earlier.id, round: 1, panelBye: 1, entry: a.id, side: 2, bye: 0, forfeit: 1 },
				{ panel: earlier.id, round: 1, panelBye: 1, entry: b.id, side: 1, bye: 0, forfeit: 1 },
				{ panel: current.id, round: 3, panelBye: 0, entry: a.id, side: 1, bye: 0, forfeit: 0 },
				{ panel: later.id, round: 4, panelBye: 0, entry: b.id, side: 2, bye: 0, forfeit: 0 },
			]));
		});

		it('leaves out panels where only one of the entries was', async () => {
			const { round1, a, c, current, panelWith } = await setup();
			const other = await panelWith(round1.id, [[a.id, 1], [c.id, 2]]);

			const meetings = (await panelRepo.getMeetings(db, [current.id])).get(current.id) ?? [];

			expect(meetings.map(meeting => meeting.panel)).not.toContain(other.id);
		});

		it('returns nothing for a panel without two entries', async () => {
			const { round3, a, panelWith } = await setup();
			const bye = await panelWith(round3.id, [[a.id, 1]]);

			expect((await panelRepo.getMeetings(db, [bye.id])).has(bye.id)).toBe(false);
		});

		it('keeps each panel\'s meetings to its own pair when several panels are asked for at once', async () => {
			const { round1, round3, a, b, c, current, panelWith } = await setup();
			const d = await factories.entry.create({ event: a.event });
			const cd = await panelWith(round3.id, [[c.id, 1], [d.id, 2]]);
			// a met c earlier: that meeting belongs to neither current pair
			const ac = await panelWith(round1.id, [[a.id, 2], [c.id, 1]]);
			const cdEarlier = await panelWith(round1.id, [[c.id, 2], [d.id, 1]]);

			const meetings = await panelRepo.getMeetings(db, [current.id, cd.id]);

			expect(new Set(meetings.get(current.id)?.map(meeting => meeting.panel))).toEqual(new Set([current.id]));
			expect(new Set(meetings.get(cd.id)?.map(meeting => meeting.panel))).toEqual(new Set([cd.id, cdEarlier.id]));
			expect([...meetings.values()].flat().map(meeting => meeting.panel)).not.toContain(ac.id);
			expect(meetings.get(current.id)?.map(meeting => meeting.entry).sort()).toEqual([a.id, b.id].sort());
		});
	});
	describe('getDoubledEntries', () => {
		// A student on entry `entry` in a round at 14:00-15:30, and on `other` in another round
		const setup = async (otherStart: string, otherEnd: string) => {
			const student = await factories.student.create();
			const entry = await factories.entry.create({ students: [student.id] });
			const other = await factories.entry.create({ students: [student.id] });

			const timeslot = await factories.timeslot.create({ start: new Date('2026-10-03T14:00:00Z'), end: new Date('2026-10-03T15:30:00Z') });
			const otherTimeslot = await factories.timeslot.create({ start: new Date(otherStart), end: new Date(otherEnd) });
			const round = await factories.round.create({ timeslot: timeslot.id });
			const otherRound = await factories.round.create({ timeslot: otherTimeslot.id });

			const panel = await factories.panel.create({ round: round.id });
			const otherPanel = await factories.panel.create({ round: otherRound.id });
			await factories.ballot.create({ panel: panel.id, entry: entry.id });
			await factories.ballot.create({ panel: otherPanel.id, entry: other.id });

			return { entry, other, panel };
		};

		it('pairs an entry with another entry sharing a student in an overlapping time slot', async () => {
			const { entry, other, panel } = await setup('2026-10-03T15:00:00Z', '2026-10-03T16:00:00Z');

			expect(await panelRepo.getDoubledEntries(db, panel.id)).toEqual([{ entry: entry.id, other: other.id }]);
		});

		it('ignores entries in time slots that don\'t overlap', async () => {
			const { panel } = await setup('2026-10-03T16:00:00Z', '2026-10-03T17:00:00Z');

			expect(await panelRepo.getDoubledEntries(db, panel.id)).toEqual([]);
		});

		it('ignores time slots that only touch', async () => {
			const { panel } = await setup('2026-10-03T15:30:00Z', '2026-10-03T16:30:00Z');

			expect(await panelRepo.getDoubledEntries(db, panel.id)).toEqual([]);
		});
	});
	describe('getPanelJudges', () => {
		it('returns each judge once, with their pronoun and whether they chair', async () => {
			const panel = await factories.panel.create();
			const person = await factories.person.create();
			await db.updateTable('person').set({ pronoun: 'she/her' }).where('id', '=', person.id).execute();
			const chair = await factories.judge.create({ person: person.id, first: 'Cleo', last: 'Chair' });
			const other = await factories.judge.create({ first: 'Otto', last: 'Other' });
			await factories.ballot.create({ panel: panel.id, judge: chair.id, chair: 1, side: 1 });
			await factories.ballot.create({ panel: panel.id, judge: chair.id, chair: 1, side: 2 });
			await factories.ballot.create({ panel: panel.id, judge: other.id });

			const judges = await panelRepo.getPanelJudges(db, [panel.id]);

			expect(judges).toHaveLength(2);
			expect(judges).toEqual(expect.arrayContaining([
				expect.objectContaining({ id: chair.id, first: 'Cleo', last: 'Chair', pronoun: 'she/her', chair: 1 }),
				expect.objectContaining({ id: other.id, first: 'Otto', last: 'Other', pronoun: null, chair: 0 }),
			]));
		});

		it('returns a row per panel for a judge on several, with that panel\'s chair', async () => {
			const [first, second] = await Promise.all([factories.panel.create(), factories.panel.create()]);
			const judge = await factories.judge.create();
			const other = await factories.judge.create();
			await factories.ballot.create({ panel: first.id, judge: judge.id, chair: 1 });
			await factories.ballot.create({ panel: second.id, judge: judge.id, chair: 0 });
			await factories.ballot.create({ panel: second.id, judge: other.id });

			const judges = await panelRepo.getPanelJudges(db, [first.id, second.id]);

			expect(judges.map(({ panel, id, chair }) => ({ panel, id, chair }))).toEqual(expect.arrayContaining([
				{ panel: first.id, id: judge.id, chair: 1 },
				{ panel: second.id, id: judge.id, chair: 0 },
				{ panel: second.id, id: other.id, chair: 0 },
			]));
			expect(judges).toHaveLength(3);
		});
	});
	describe('getPanelEntryStudents', () => {
		it('returns each entry student on the panels with their panel, and a null student row for an entry without students', async () => {
			const [first, second] = await Promise.all([factories.panel.create(), factories.panel.create()]);
			const student = await factories.student.create({ first: 'Sam', last: 'Student' });
			const withStudent = await factories.entry.create({ code: 'AB', students: [student.id] });
			const withoutStudents = await factories.entry.create({ code: 'CD' });
			await factories.ballot.create({ panel: first.id, entry: withStudent.id });
			await factories.ballot.create({ panel: second.id, entry: withoutStudents.id });

			const rows = await panelRepo.getPanelEntryStudents(db, [first.id, second.id]);

			expect(rows).toHaveLength(2);
			expect(rows).toEqual(expect.arrayContaining([
				expect.objectContaining({ panel: first.id, entryId: withStudent.id, entryCode: 'AB', studentId: student.id, first: 'Sam', last: 'Student' }),
				expect.objectContaining({ panel: second.id, entryId: withoutStudents.id, entryCode: 'CD', studentId: null }),
			]));
		});
	});
	describe('getSectionRoomContext', () => {
		it('returns a row per section with its own room, event and tourn', async () => {
			const { Tourn, Event, Round } = await factories.tourn.createFull({ Event: { abbr: 'PF' } });
			const [roomA, roomB] = await Promise.all([factories.room.create({ name: 'Room A' }), factories.room.create({ name: 'Room B' })]);
			const first = await factories.panel.create({ round: Round.id, room: roomA.id, letter: 'A' });
			const second = await factories.panel.create({ round: Round.id, room: roomB.id, letter: 'B' });

			const rows = await panelRepo.getSectionRoomContext(db, [first.id, second.id]);

			expect(rows).toHaveLength(2);
			expect(rows).toEqual(expect.arrayContaining([
				expect.objectContaining({ panelId: first.id, panelLetter: 'A', roomName: 'Room A', eventId: Event.id, eventAbbr: 'PF', tournId: Tourn.id, matchPanelId: null }),
				expect.objectContaining({ panelId: second.id, panelLetter: 'B', roomName: 'Room B', eventId: Event.id, eventAbbr: 'PF', tournId: Tourn.id, matchPanelId: null }),
			]));
		});
	});
	describe('getPanels', () => {
		it('retrieves all panels for a given round', async () => {
			const Round = await factories.round.create();
			const panel1 = await factories.panel.create({ round: Round.id });
			const panel2 = await factories.panel.create({ round: Round.id });

			const results = await panelRepo.getPanels(db,{ round: Round.id });
			expect(results).toBeDefined();
			expect(results.length).toBeGreaterThanOrEqual(2);
			results.forEach(s => {
				expect(s.round, `expected roundId to be ${Round.id} but was ${s.round}`).toBe(Round.id);
			});
			expect(results.map(s => s.id)).toEqual(expect.arrayContaining([panel1.id, panel2.id]));
		});
		it('retrieves all panels when no scope is provided', async () => {
			const panel1 = await factories.panel.create();
			const panel2 = await factories.panel.create();

			const results = await panelRepo.getPanels(db);
			expect(results).toBeDefined();
			expect(results.length).toBeGreaterThanOrEqual(2);
			expect(results.map(s => s.id)).toEqual(expect.arrayContaining([panel1.id, panel2.id]));
		});
	});
	describe('getFlips', () => {
		it('returns a row per entry on the panel, opponent included, for an entry filter', async () => {
			const { panel, aff, neg, winner } = await factories.flip.create({ flip: { side_locked: 1, side_chosen: 'Aff' } });

			const rows = await panelRepo.getFlips(db, { entries: [aff.id] });

			expect(rows).toHaveLength(2);
			expect(rows.find((row) => row.entry === aff.id)).toMatchObject({
				id: panel.id,
				bye: 0,
				entryCode: aff.code,
				side: 1,
				settings: { flip_status: 'winner', flip_winner: String(winner.id) },
				flip: { side_locked: 1, side_chosen: 'Aff' },
				roundSettings: { flip_published: '1' },
				eventSettings: null,
			});
			expect(rows.find((row) => row.entry === neg.id)).toMatchObject({ id: panel.id, side: 2 });
			expect(rows[0].tournEnd).toBeInstanceOf(Date);
		});

		it('selects panels by school and leaves out other schools\' panels', async () => {
			const school = await factories.school.create();
			const { panel } = await factories.flip.create({ schools: { neg: school.id } });
			const { panel: elsewhere } = await factories.flip.create();

			const rows = await panelRepo.getFlips(db, { schools: [school.id] });

			expect(new Set(rows.map((row) => row.id))).toEqual(new Set([panel.id]));
			expect(rows.map((row) => row.id)).not.toContain(elsewhere.id);
		});

		it('leaves out finished flips and panels with no flip', async () => {
			const { aff } = await factories.flip.create({ status: 'done' });
			const panel = await factories.panel.create();
			await factories.ballot.create({ panel: panel.id, entry: aff.id, side: 1 });

			expect(await panelRepo.getFlips(db, { entries: [aff.id] })).toEqual([]);
		});

		it('sets audit when any of the entry\'s ballots is audited', async () => {
			const { panel, aff } = await factories.flip.create();
			await factories.ballot.create({ panel: panel.id, entry: aff.id, side: 1, audit: 1 });

			const rows = await panelRepo.getFlips(db, { entries: [aff.id] });

			expect(rows.find((row) => row.entry === aff.id)?.audit).toBe(1);
		});

		it('reads invalid flip JSON as no flip state', async () => {
			const { panel, aff } = await factories.flip.create();
			await db.updateTable('panel_setting').set({ value: 'text', value_text: '{not json' }).where('panel', '=', panel.id).where('tag', '=', 'flip').execute();

			const rows = await panelRepo.getFlips(db, { entries: [aff.id] });

			expect(rows[0].flip).toBeNull();
		});

		it('returns nothing for empty filters', async () => {
			expect(await panelRepo.getFlips(db, { entries: [] })).toEqual([]);
			expect(await panelRepo.getFlips(db, { schools: [] })).toEqual([]);
		});
	});
	describe('createPanel', () => {
		it('creates panel when provided valid data', async () => {
			const panel = factories.panel.createPanelData();
			const created = await panelRepo.createPanel(db,panel);
			expect(created).toBeDefined();
		});
	});
	describe('updatePanel', () => {
		it('updates panel when provided valid data', async () => {
			const panel = await factories.panel.create();
			const newData = factories.panel.createPanelData({letter: 'Z'});
			await panelRepo.updatePanel(db, panel.id, newData);
			const updated = await panelRepo.getPanel(db, panel.id);
			expect(updated).toBeDefined();
			expect(updated?.letter).toBe('Z');
		});
	});
	describe('getPanelTourn', () => {
		it('returns the tournament the panel belongs to', async () => {
			const tourn = await factories.tourn.create();
			const event = await factories.event.create({ tourn: tourn.id });
			const round = await factories.round.create({ event: event.id });
			const panel = await factories.panel.create({ round: round.id });

			const result = await panelRepo.getPanelTourn(db, panel.id);

			expect(result).toEqual(await db.selectFrom('tourn').selectAll().where('id', '=', tourn.id).executeTakeFirst());
		});

		it('returns undefined for a panel without a round', async () => {
			const panel = await factories.panel.create();

			expect(await panelRepo.getPanelTourn(db, panel.id)).toBeUndefined();
		});

		it('returns undefined for a panel that does not exist', async () => {
			expect(await panelRepo.getPanelTourn(db, 999999999)).toBeUndefined();
		});
	});
	describe('deletePanel', () => {
		it('deletes a panel and returns true', async () => {
			// Arrange
			const panel = await factories.panel.create();
			await panelRepo.deletePanel(db,panel.id);
			const deleted = await panelRepo.getPanel(db, panel.id);
			expect(deleted).toBeUndefined();
		});
	});
	describe('getJudgeHistoryPanels', () => {
		// A judge with ballots on four rounds: assigned (two flights), unpublished, with results
		// posted, and with results posted but the round unpublished
		async function judgeWithRounds() {
			const { Tourn, Category, Event } = await factories.tourn.createFull({ Event: { type: 'debate', settings: { flight_offset: 90 } } });
			const Judge = await factories.judge.create({ category: Category.id });
			const Timeslot = await factories.timeslot.create({ tourn: Tourn.id, start: new Date('2025-03-08T15:00:00Z') });
			const Room = await factories.room.create();

			const rounds = {
				assigned: await factories.round.create({ event: Event.id, timeslot: Timeslot.id, name: 1, published: 1, post_primary: 0, flighted: 2 }),
				unpublished: await factories.round.create({ event: Event.id, name: 2, published: 0 }),
				posted: await factories.round.create({ event: Event.id, name: 3, published: 1, post_primary: 3 }),
				postedUnpublished: await factories.round.create({ event: Event.id, name: 4, published: 0, post_primary: 3 }),
			};
			const panels = {
				assignedFlight1: await factories.panel.create({ round: rounds.assigned.id, room: Room.id, flight: '1' }),
				assigned: await factories.panel.create({ round: rounds.assigned.id, room: Room.id, flight: '2' }),
				unpublished: await factories.panel.create({ round: rounds.unpublished.id }),
				posted: await factories.panel.create({ round: rounds.posted.id }),
				postedUnpublished: await factories.panel.create({ round: rounds.postedUnpublished.id }),
			};
			for (const panel of Object.values(panels)) {
				for (const side of [1, 2]) {
					const Entry = await factories.entry.create({ event: Event.id, tourn: Tourn.id, code: `${panel.id}-${side}` });
					await factories.ballot.create({ panel: panel.id, judge: Judge.id, entry: Entry.id, side });
				}
			}
			return { Judge, Timeslot, Room, rounds, panels };
		}

		it('lists sections in published rounds, staged by whether results are posted', async () => {
			const { Judge, panels } = await judgeWithRounds();

			const result = await panelRepo.getJudgeHistoryPanels(db, Judge.id);

			expect(result.map(p => [p.id, p.stage])).toEqual([
				[panels.assignedFlight1.id, 'assigned'],
				[panels.assigned.id, 'assigned'],
				[panels.posted.id, 'results'],
			]);
		});

		it('returns the room, flight start, side labels, and sided entries', async () => {
			const { Judge, Timeslot, Room, rounds, panels } = await judgeWithRounds();

			const [flight1, flight2, posted] = await panelRepo.getJudgeHistoryPanels(db, Judge.id);

			expect(flight2).toMatchObject({
				id: panels.assigned.id,
				flight: 2,
				Round: { id: rounds.assigned.id, name: 1 },
				Room: { id: Room.id, name: Room.name },
				SideLabels: { aff: 'Aff', neg: 'Neg' },
			});
			// Flight 2 starts flight_offset minutes after the timeslot
			const timeslotStart = Timeslot.start?.getTime() ?? 0;
			expect(flight1.start?.getTime()).toBe(timeslotStart);
			expect(flight2.start?.getTime()).toBe(timeslotStart + 90 * 60_000);
			expect(flight2.Entries.map(e => e.side)).toEqual([1, 2]);
			// An unflighted round has no flight number or room here
			expect(posted.flight).toBeNull();
			expect(posted.Room).toBeNull();
		});
	});
	describe('getPanels with ids', () => {
		it('returns the panels with the given ids and the settings asked for', async () => {
			const { Round } = await factories.tourn.createFull();
			const first = await factories.panel.create({ round: Round.id, settings: { flip_status: 'done', flip_at: new Date('2026-03-01T10:00:00Z'), other: 'x' } });
			const second = await factories.panel.create({ round: Round.id });
			await factories.panel.create({ round: Round.id });

			const rows = await panelRepo.getPanels(db, { ids: [first.id, second.id], settings: ['flip_status', 'flip_at'] });

			expect(rows.map(panel => panel.id).sort()).toEqual([first.id, second.id].sort());
			expect(rows.find(panel => panel.id === first.id)?.settings).toEqual({ flip_status: 'done', flip_at: '2026-03-01 10:00:00' });
		});
	});
});
