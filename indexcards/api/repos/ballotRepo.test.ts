
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

});