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

			const meetings = await panelRepo.getMeetings(db, current.id);

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

			const meetings = await panelRepo.getMeetings(db, current.id);

			expect(meetings.map(meeting => meeting.panel)).not.toContain(other.id);
		});

		it('returns nothing for a panel without two entries', async () => {
			const { round3, a, panelWith } = await setup();
			const bye = await panelWith(round3.id, [[a.id, 1]]);

			expect(await panelRepo.getMeetings(db, bye.id)).toEqual([]);
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

			const judges = await panelRepo.getPanelJudges(db, panel.id);

			expect(judges).toHaveLength(2);
			expect(judges).toEqual(expect.arrayContaining([
				expect.objectContaining({ id: chair.id, first: 'Cleo', last: 'Chair', pronoun: 'she/her', chair: 1 }),
				expect.objectContaining({ id: other.id, first: 'Otto', last: 'Other', pronoun: null, chair: 0 }),
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
				SideLabels: { aff: null, neg: null },
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
	describe('getCurrentBallots', async () => {
		it('returns a current ballot when one exists', async () => {
			const data = await factories.person.createBallot();

			const result = await panelRepo.getCurrentBallots(db,data.Person.id,data.Tourn.id);

			expect(result).toBeInstanceOf(Array);
			const ballot = result[0];
			expect(ballot).toBeDefined();
			expect(ballot.Judge.id).toBe(data.Judge.id);
		});

		it('includes the event online_ballots setting', async () => {
			const data = await factories.person.createBallot();

			const [before] = await panelRepo.getCurrentBallots(db, data.Person.id, data.Tourn.id);
			expect(before.Judge.Category.Event.settings.online_ballots).toBe(false);

			await db.insertInto('event_setting')
				.values({ event: before.Judge.Category.Event.id, tag: 'online_ballots', value: '1' })
				.execute();

			const [after] = await panelRepo.getCurrentBallots(db, data.Person.id, data.Tourn.id);
			expect(after.Judge.Category.Event.settings.online_ballots).toBe(true);
		});
	});
});
