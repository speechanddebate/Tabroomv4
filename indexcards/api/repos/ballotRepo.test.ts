
import ballotRepo from './ballotRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';
import type { Panel } from '../data/schema.js';
import type { Selectable } from 'kysely';

let section: Selectable<Panel> | null = null;

describe('ballotRepo', async () => {
	beforeAll(async () => {
		section = await factories.panel.create();
	});
	describe('getBallots', async () => {

		it('should return an empty array if no ballots exist for the section', async () => {
			const ballots = await ballotRepo.getBallots(db, { panel: 999999 }); // unlikely sectionId
			expect(Array.isArray(ballots)).toBe(true);
			expect(ballots.length).toBe(0);
		});

		it('should return ballots for a given sectionId', async () => {
			const ballot = await ballotRepo.createBallot(db, { panel: section!.id });
			const ballots = await ballotRepo.getBallots(db, { panel: section!.id });
			expect(Array.isArray(ballots)).toBe(true);
			expect(ballots.length).toBeGreaterThan(0);
			const found = ballots.find(b => b.id === ballot?.id);
			expect(found).toBeDefined();
			expect(found?.panel).toBe(section!.id);
		});
	});
	describe('createBallot', async () => {
		it('should create a ballot and retrieve it', async () => {
			const ballot = await ballotRepo.createBallot(db, { panel: section!.id });
			const retrievedBallot = await ballotRepo.getBallot(db, ballot!.id);

			//ensure that id, updatedAt and createdAt are present and not null
			expect(retrievedBallot).toHaveProperty('id');
			expect(retrievedBallot?.id).not.toBeNull();
			expect(retrievedBallot?.timestamp).not.toBeNull();
			expect(retrievedBallot?.created_at).not.toBeNull();
		});
	});
	describe('forUpdate', async () => {
		// Fails at once instead of waiting when another transaction holds the row lock
		const lockNoWait = (id: number) => db.selectFrom('ballot')
			.select('id')
			.where('id', '=', id)
			.forUpdate()
			.noWait()
			.execute();

		it('locks the ballot rows until the transaction ends', async () => {
			const ballot = await ballotRepo.createBallot(db, { panel: section!.id });

			await db.transaction().execute(async trx => {
				const locked = await ballotRepo.getBallots(trx, { panel: section!.id, forUpdate: true });
				expect(locked.map(b => b.id)).toContain(ballot.id);

				await expect(lockNoWait(ballot.id)).rejects.toThrow();
			});

			await expect(lockNoWait(ballot.id)).resolves.toEqual([{ id: ballot.id }]);
		});

		it('does not lock the rows without forUpdate', async () => {
			const ballot = await ballotRepo.createBallot(db, { panel: section!.id });

			await db.transaction().execute(async trx => {
				await ballotRepo.getBallot(trx, ballot.id);

				await expect(lockNoWait(ballot.id)).resolves.toEqual([{ id: ballot.id }]);
			});
		});
	});
	describe('updateBallots', async () => {
		it('updates every given ballot and returns the ids', async () => {
			const first = await ballotRepo.createBallot(db, { panel: section!.id });
			const second = await ballotRepo.createBallot(db, { panel: section!.id });
			const untouched = await ballotRepo.createBallot(db, { panel: section!.id });

			const ids = await ballotRepo.updateBallots(db, [first.id, second.id], { side: 2, chair: 1 });

			expect(ids).toEqual([first.id, second.id]);
			for (const id of [first.id, second.id]) {
				const updated = await ballotRepo.getBallot(db, id);
				expect(updated?.side).toBe(2);
				expect(updated?.chair).toBe(1);
			}
			const other = await ballotRepo.getBallot(db, untouched.id);
			expect(other?.side).toBe(untouched.side);
			expect(other?.chair).toBe(untouched.chair);
		});

		it('returns an empty array without querying for no ids', async () => {
			expect(await ballotRepo.updateBallots(db, [], { side: 2 })).toEqual([]);
		});
	});
	describe('markBallotsStarted', async () => {
		const setup = async () => {
			const panel = await factories.panel.create();
			const judge = await factories.judge.create();
			const otherJudge = await factories.judge.create();
			const person = await factories.person.create();
			const ballots = await Promise.all([1, 2].map(side => ballotRepo.createBallot(db, { panel: panel.id, judge: judge.id, side })));
			const otherBallot = await ballotRepo.createBallot(db, { panel: panel.id, judge: otherJudge.id });
			return { panel, judge, person, ballots, otherBallot };
		};

		it('sets started_by and judge_started on the judge\'s ballots on the panel', async () => {
			const { panel, judge, person, ballots, otherBallot } = await setup();
			const before = Date.now();

			const changed = await ballotRepo.markBallotsStarted(db, { judge: judge.id, panel: panel.id, person: person.id });

			expect(changed).toBe(true);
			for (const ballot of ballots) {
				const started = await ballotRepo.getBallot(db, ballot.id);
				expect(started?.started_by).toBe(person.id);
				expect(started?.judge_started).toBeInstanceOf(Date);
				// NOW() has second precision
				expect(started!.judge_started!.getTime()).toBeGreaterThanOrEqual(before - 1000);
				expect(started!.judge_started!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
			}
			const other = await ballotRepo.getBallot(db, otherBallot.id);
			expect(other?.started_by).toBeNull();
			expect(other?.judge_started).toBeNull();
		});

		it('leaves ballots that were already started alone and returns false', async () => {
			const { panel, judge, person, ballots } = await setup();
			await ballotRepo.markBallotsStarted(db, { judge: judge.id, panel: panel.id, person: person.id });
			const first = await ballotRepo.getBallot(db, ballots[0].id);
			const later = await factories.person.create();

			const changed = await ballotRepo.markBallotsStarted(db, { judge: judge.id, panel: panel.id, person: later.id });

			expect(changed).toBe(false);
			const again = await ballotRepo.getBallot(db, ballots[0].id);
			expect(again?.started_by).toBe(person.id);
			expect(again?.judge_started).toEqualDate(first!.judge_started!);
		});

		it('returns false when the judge has no ballots on the panel', async () => {
			const { panel, person } = await setup();
			const judge = await factories.judge.create();

			expect(await ballotRepo.markBallotsStarted(db, { judge: judge.id, panel: panel.id, person: person.id })).toBe(false);
		});
	});
	describe('deleteBallots', async () => {
		it('deletes every given ballot and returns true', async () => {
			const first = await ballotRepo.createBallot(db, { panel: section!.id });
			const second = await ballotRepo.createBallot(db, { panel: section!.id });
			const kept = await ballotRepo.createBallot(db, { panel: section!.id });

			expect(await ballotRepo.deleteBallots(db, [first.id, second.id])).toBe(true);

			expect(await ballotRepo.getBallot(db, first.id)).toBeUndefined();
			expect(await ballotRepo.getBallot(db, second.id)).toBeUndefined();
			expect(await ballotRepo.getBallot(db, kept.id)).toBeDefined();
		});

		it('returns false when no ballot matches', async () => {
			expect(await ballotRepo.deleteBallots(db, [999999999])).toBe(false);
		});

		it('returns false for no ids', async () => {
			expect(await ballotRepo.deleteBallots(db, [])).toBe(false);
		});
	});

	describe('getJudgeBallotCounts', () => {
		it('counts the distinct panels and the ballots each judge has had audited', async () => {
			const { Round } = await factories.tourn.createFull();
			const { Judge: busy } = await factories.person.createJudge();
			const { Judge: idle } = await factories.person.createJudge();
			const { Judge: other } = await factories.person.createJudge();
			const first = await factories.panel.create({ round: Round.id });
			const second = await factories.panel.create({ round: Round.id });
			// two audited ballots on the first panel (a debate), one on the second, one not yet audited
			await factories.ballot.create({ panel: first.id, judge: busy.id, entry: (await factories.entry.create()).id, side: 1, audit: 1 });
			await factories.ballot.create({ panel: first.id, judge: busy.id, entry: (await factories.entry.create()).id, side: 2, audit: 1 });
			await factories.ballot.create({ panel: second.id, judge: busy.id, entry: (await factories.entry.create()).id, audit: 1 });
			await factories.ballot.create({ panel: second.id, judge: idle.id, entry: (await factories.entry.create()).id, audit: 0 });
			await factories.ballot.create({ panel: second.id, judge: other.id, entry: (await factories.entry.create()).id, audit: 1 });

			const counts = await ballotRepo.getJudgeBallotCounts(db, { judges: [busy.id, idle.id] });

			expect(counts.get(busy.id)).toEqual({ panels: 2, ballots: 3 });
			expect(counts.has(idle.id)).toBe(false);
			expect(counts.has(other.id)).toBe(false);
		});
	});

	describe('getJudgePanels and getEntryRounds', () => {
		// one panel: the judge, two entries, a room
		async function createPanel() {
			const tourn = await factories.tourn.createFull();
			const { Judge } = await factories.person.createJudge({ Judge: { category: tourn.Category.id, first: 'Jo', last: 'Judge', code: 'J1' } });
			const Room = await factories.room.create({ name: '101' });
			const Panel = await factories.panel.create({ round: tourn.Round.id, room: Room.id, letter: 'A', flight: 2 });
			const mine = await factories.entry.create({ event: tourn.Event.id, code: 'AB' });
			const opponent = await factories.entry.create({ event: tourn.Event.id, code: 'CD' });
			const started = new Date('2026-03-01T09:30:00Z');
			const myBallot = await factories.ballot.create({ panel: Panel.id, judge: Judge.id, entry: mine.id, side: 1, judge_started: started });
			const theirBallot = await factories.ballot.create({ panel: Panel.id, judge: Judge.id, entry: opponent.id, side: 2 });
			return { ...tourn, Judge, Room, Panel, mine, opponent, myBallot, theirBallot };
		}

		it("getJudgePanels returns the judges' ballots with the round, time, room, and entry their panel card shows", async () => {
			const { Tourn, Category, Event, Timeslot, Round, Judge, Room, Panel, mine, myBallot, theirBallot } = await createPanel();
			// the judge's ballot on another panel of the round
			const elsewhere = await factories.panel.create({ round: Round.id });
			await factories.ballot.create({ panel: elsewhere.id, judge: Judge.id, entry: (await factories.entry.create()).id });

			const rows = await ballotRepo.getJudgePanels(db, { judges: [Judge.id] });

			expect(rows).toHaveLength(3);
			expect(rows.map(row => row.id)).toContain(theirBallot.id);
			expect(rows.find(row => row.id === myBallot.id)).toEqual({
				id: myBallot.id,
				judge: Judge.id,
				side: 1,
				speakerorder: 0,
				audit: 0,
				judge_started: new Date('2026-03-01T09:30:00Z'),
				chair: 0,
				panel: Panel.id,
				panelLetter: 'A',
				// panel.flight is a string column
				panelFlight: '2',
				round: Round.id,
				roundName: Round.name,
				roundLabel: Round.label,
				roundType: Round.type,
				roundPublished: Round.published,
				roundFlighted: Round.flighted,
				roundStart: Round.start_time,
				timeslotStart: Timeslot.start,
				timeslotEnd: Timeslot.end,
				room: Room.id,
				roomName: '101',
				roomUrl: Room.url,
				roomJudgeUrl: Room.judge_url,
				roomNotes: Room.notes,
				event: Event.id,
				eventName: Event.name,
				eventAbbr: Event.abbr,
				matchEventAbbr: null,
				matchPanelId: null,
				eventType: Event.type,
				category: Category.id,
				tourn: Tourn.id,
				entry: mine.id,
				entryCode: 'AB',
				entryActive: 1,
				scoreTag: null,
			});
		});

		it('getJudgePanels returns the event online_event_match points to, and its section with this round name and letter', async () => {
			const Match = await factories.event.create({ abbr: 'PF' });
			// the factory leaves round.name null, which never matches
			const { Round } = await factories.tourn.createFull({ Event: { settings: { online_event_match: String(Match.id) } }, Round: { name: 3 } });
			const { Judge } = await factories.person.createJudge();
			const Panel = await factories.panel.create({ round: Round.id, letter: 'B' });
			await factories.ballot.create({ panel: Panel.id, judge: Judge.id, entry: (await factories.entry.create()).id });

			expect((await ballotRepo.getJudgePanels(db, { judges: [Judge.id] })).map((row) => [row.matchEventAbbr, row.matchPanelId])).toEqual([['PF', null]]);

			const MatchRound = await factories.round.create({ event: Match.id, name: Round.name });
			await factories.panel.create({ round: MatchRound.id, letter: 'A' });
			const MatchPanel = await factories.panel.create({ round: MatchRound.id, letter: 'B' });

			expect((await ballotRepo.getJudgePanels(db, { judges: [Judge.id] })).map((row) => row.matchPanelId)).toEqual([MatchPanel.id]);
		});

		it("getEntryRounds returns the entries' or panels' ballots with the round's publish levels and the judge", async () => {
			const { Tourn, Category, Event, Timeslot, Round, Judge, Room, Panel, mine, myBallot, theirBallot } = await createPanel();

			const byEntry = await ballotRepo.getEntryRounds(db, { entries: [mine.id] });
			expect(byEntry).toEqual([{
				id: myBallot.id,
				side: 1,
				speakerorder: 0,
				audit: 0,
				panel: Panel.id,
				panelLetter: 'A',
				panelFlight: '2',
				panelBye: 0,
				round: Round.id,
				roundName: Round.name,
				roundLabel: Round.label,
				roundType: Round.type,
				roundPublished: Round.published,
				roundPostPrimary: Round.post_primary,
				roundPostSecondary: Round.post_secondary,
				roundPostFeedback: Round.post_feedback,
				roundFlighted: Round.flighted,
				roundStart: Round.start_time,
				timeslotStart: Timeslot.start,
				roomName: '101',
				roomUrl: Room.url,
				event: Event.id,
				eventType: Event.type,
				category: Category.id,
				tourn: Tourn.id,
				entry: mine.id,
				entryCode: 'AB',
				entrySchool: null,
				judge: Judge.id,
				judgeFirst: 'Jo',
				judgeLast: 'Judge',
				judgeCode: 'J1',
			}]);

			const byPanel = await ballotRepo.getEntryRounds(db, { panels: [Panel.id] });
			expect(byPanel.map(row => [row.id, row.entryCode])).toEqual([[myBallot.id, 'AB'], [theirBallot.id, 'CD']]);
		});

		it('keeps only ballots in rounds published at any level or with primary results posted when roundVisible is set', async () => {
			const { Event, Timeslot } = await factories.tourn.createFull();
			const Entry = await factories.entry.create({ event: Event.id });
			const visible: number[] = [];
			for (const [published, postPrimary, shown] of [[0, 0, false], [2, 0, true], [0, 1, true], [1, 0, true]] as const) {
				const round = await factories.round.create({ event: Event.id, timeslot: Timeslot.id, published, post_primary: postPrimary });
				const panel = await factories.panel.create({ round: round.id });
				const ballot = await factories.ballot.create({ panel: panel.id, entry: Entry.id });
				if (shown) visible.push(ballot.id);
			}

			const rows = await ballotRepo.getEntryRounds(db, { entries: [Entry.id], roundVisible: true });

			expect(rows.map(row => row.id).sort()).toEqual(visible.sort());
		});
	});
});