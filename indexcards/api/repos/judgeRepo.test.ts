import judgeRepo from './judgeRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';
import { faker } from '@faker-js/faker';

describe('judgeRepo', () => {
	describe('buildJudgeQuery', () => {
		it('includes settings when requested', async () => {
			const Judge = await factories.judge.create();

			await db.insertInto('judge_setting').values({
				judge: Judge.id,
				tag: 'exampleSetting',
				value: 'exampleValue',
			}).execute();

			const judge = await judgeRepo.getJudge(db, Judge.id, { settings: true });

			expect(judge).toBeDefined();
			expect(judge!.settings).toBeDefined();
			expect(judge!.settings!.exampleSetting).toBe('exampleValue');
		});
	});

	describe('getJudge', () => {
		it('returns the judge when the id is valid', async () => {
			const Judge = await factories.judge.create();

			const result = await judgeRepo.getJudge(db, Judge.id);

			expect(result).not.toBeUndefined();
			expect(result!.id).toBe(Judge.id);
		});

		it('returns undefined when the id is invalid', async () => {
			const result = await judgeRepo.getJudge(db, 999999);
			expect(result).toBeUndefined();
		});
	});

	describe('createJudge', () => {
		it('creates a judge and returns the new id', async () => {
			const Person = await factories.person.create();
			const newJudge = await judgeRepo.createJudge(db, { person: Person.id });

			expect(newJudge).toBeDefined();

			const judge = await judgeRepo.getJudge(db, newJudge.id);
			expect(judge).not.toBeUndefined();
			expect(judge!.id).toBe(newJudge.id);
		});
	});
	describe('unlinkedSearch', () => {
		it('throws when first or last is missing', async () => {
			await expect(judgeRepo.unlinkedSearch(db,{ first: 'Pat' })).rejects.toThrow(
				'unlinkedSearch requires first and last parameters'
			);
		});

		it('returns active unlinked judges with tournament and school names', async () => {
			const tourn = await factories.tourn.create({name: 'Test Tournament'});
			const category = await factories.category.create({ tourn: tourn.id });
			const school = await factories.school.create({ name: 'Central High' });

			const Judge = await factories.judge.create({
				category: category.id,
				school: school.id,
				person_request: null,
			});

			const results = await judgeRepo.unlinkedSearch(db,{ first: Judge.first!, last: Judge.last! });

			expect(results).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: Judge.id,
						first: Judge.first,
						last: Judge.last,
						school_name: 'Central High',
						tourn_name: 'Test Tournament',
					}),
				])
			);
		});

		it('excludes ended tournaments and rows requested by the excluded person', async () => {
			const { id: requesterId } = await factories.person.create();
			const { id: otherRequesterId } = await factories.person.create();
			const now = new Date();

			const activeTourn = await factories.tourn.create({
				start: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
				end: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
			});
			const endedTourn = await factories.tourn.create({
				start: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
				end: new Date(now.getTime() - 24 * 60 * 60 * 1000),
			});

			const activeCategory = await factories.category.create({ tourn: activeTourn.id });
			const endedCategory = await factories.category.create({ tourn: endedTourn.id });

			const includedJudge = await factories.judge.create({
				first: 'Alex',
				last: 'Jordan',
				category: activeCategory.id,
				person_request: otherRequesterId,
			});
			const excludedByRequesterJudge = await factories.judge.create({
				first: 'Alex',
				last: 'Jordan',
				category: activeCategory.id,
				person_request: requesterId,
			});
			const excludedByEndedTournJudge = await factories.judge.create({
				first: 'Alex',
				last: 'Jordan',
				category: endedCategory.id,
			});

			const results = await judgeRepo.unlinkedSearch(db,
				{ first: 'Alex', last: 'Jordan' },
				{ notRequestedBy: requesterId }
			);

			const resultIds = results.map(judge => judge.id);
			expect(resultIds).toContain(includedJudge.id);
			expect(resultIds).not.toContain(excludedByRequesterJudge.id);
			expect(resultIds).not.toContain(excludedByEndedTournJudge.id);
		});

	});
	describe('getJudgeHistory', () => {
		it('returns judge history for a person', async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create(); // start is past by default
			const category = await factories.category.create({ tourn: Tourn.id });
			const Judge = await factories.judge.create({ person: Person.id, category: category.id });

			// Create event → round → panel → ballot chain
			const Event = await factories.event.create({ category: category.id });
			const Round = await factories.round.create({ event: Event.id, published: 1 });
			const Panel = await factories.panel.create({ round: Round.id });
			await factories.ballot.create({ panel: Panel.id, judge: Judge.id });
			// An unpublished round does not count as judged
			const Unpublished = await factories.round.create({ event: Event.id, published: 0 });
			const UnpublishedPanel = await factories.panel.create({ round: Unpublished.id });
			await factories.ballot.create({ panel: UnpublishedPanel.id, judge: Judge.id });
			const history = await judgeRepo.getJudgeHistory(db,Person.id, {limit: 10, offset: 0 });

			expect(history).toHaveLength(1);
			expect(history[0].id).toBe(Judge.id);
			expect(history[0].Category.id).toBe(category.id);
			expect(Number(history[0].roundCount)).toBe(1);
		});

		it('returns tournament dates as the stored UTC instants with the tourn tz', async () => {
			const Person = await factories.person.create();
			// Midnight-adjacent instants, so a zone shift would move the calendar day
			const start = new Date('2025-03-08T05:30:00Z');
			const end = new Date('2025-03-10T04:00:00Z');
			const Tourn = await factories.tourn.create({ tz: 'America/Los_Angeles', start, end });
			const category = await factories.category.create({ tourn: Tourn.id });
			await factories.judge.create({ person: Person.id, category: category.id });

			const history = await judgeRepo.getJudgeHistory(db, Person.id);

			expect(history).toHaveLength(1);
			expect(history[0].Tourn.start?.getTime()).toBe(start.getTime());
			expect(history[0].Tourn.end?.getTime()).toBe(end.getTime());
			expect(history[0].Tourn.tz).toBe('America/Los_Angeles');
			expect(history[0].Weekend).toBeNull();
		});

		it("returns the weekend of the judge's event when the tournament uses weekends", async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create();
			const category = await factories.category.create({ tourn: Tourn.id });
			await factories.judge.create({ person: Person.id, category: category.id });
			const weekend = await factories.weekend.create({ tourn: Tourn.id, start: new Date('2025-02-01T14:00:00Z') });
			await factories.event.create({ category: category.id, settings: { weekend: weekend.id } });

			const history = await judgeRepo.getJudgeHistory(db, Person.id);

			expect(history).toHaveLength(1);
			expect(history[0].Weekend).toEqual({
				id: weekend.id,
				name: weekend.name,
				start: weekend.start,
				end: weekend.end,
			});
		});

		it('pages newest first and counts only tournaments that count as history', async () => {
			const Person = await factories.person.create();
			const DAY = 24 * 60 * 60 * 1000;
			const judgeAt = async (tournOverrides: Parameters<typeof factories.tourn.create>[0]) => {
				const Tourn = await factories.tourn.create(tournOverrides);
				const category = await factories.category.create({ tourn: Tourn.id });
				return factories.judge.create({ person: Person.id, category: category.id });
			};
			const oldest = await judgeAt({ start: new Date(Date.now() - 30 * DAY) });
			const middle = await judgeAt({ start: new Date(Date.now() - 20 * DAY) });
			const newest = await judgeAt({ start: new Date(Date.now() - 10 * DAY) });
			await judgeAt({ start: new Date(Date.now() - 5 * DAY), hidden: 1 });
			await judgeAt({ start: new Date(Date.now() + 5 * DAY) });

			const firstPage = await judgeRepo.getJudgeHistory(db, Person.id, { limit: 2, offset: 0 });
			const secondPage = await judgeRepo.getJudgeHistory(db, Person.id, { limit: 2, offset: 2 });

			expect(firstPage.map(j => j.id)).toEqual([newest.id, middle.id]);
			expect(secondPage.map(j => j.id)).toEqual([oldest.id]);
			expect(await judgeRepo.countJudgeHistory(db, Person.id)).toBe(3);
		});
	});
	describe('getJudgeTournHistory', () => {
		const DAY = 24 * 60 * 60 * 1000;
		const finishedTourn = () => factories.tourn.create({
			start: new Date(Date.now() - 10 * DAY),
			end: new Date(Date.now() - 8 * DAY),
		});

		it("returns the judge's school, code, and how much they judged", async () => {
			const Person = await factories.person.create();
			const Tourn = await finishedTourn();
			const Category = await factories.category.create({ tourn: Tourn.id });
			const School = await factories.school.create({ tourn: Tourn.id });
			const Judge = await factories.judge.create({
				person: Person.id, category: Category.id, school: School.id, code: '42A', obligation: 4, hired: 2,
			});
			// One published round with two flights, so the judge has 2 ballots but 1 round;
			// an unpublished round counts for neither
			const Event = await factories.event.create({ category: Category.id });
			const Round = await factories.round.create({ event: Event.id, flighted: 2, published: 1 });
			for (const flight of ['1', '2']) {
				const Panel = await factories.panel.create({ round: Round.id, flight });
				await factories.ballot.create({ panel: Panel.id, judge: Judge.id });
			}
			const Unpublished = await factories.round.create({ event: Event.id, published: 0 });
			const UnpublishedPanel = await factories.panel.create({ round: Unpublished.id });
			await factories.ballot.create({ panel: UnpublishedPanel.id, judge: Judge.id });

			const records = await judgeRepo.getJudgeTournHistory(db, Person.id, Tourn.id);

			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				id: Judge.id,
				code: '42A',
				obligation: 4,
				hired: 2,
				noCodes: false,
				School: { id: School.id, name: School.name },
				Category: { id: Category.id },
				Tourn: { id: Tourn.id, webname: Tourn.webname, tz: Tourn.tz },
				roundCount: 1,
				ballotCount: 2,
			});
		});

		it('flags hidden codes and returns one record per category', async () => {
			const Person = await factories.person.create();
			const Tourn = await finishedTourn();
			const Open = await factories.category.create({ tourn: Tourn.id, name: 'Open', settings: { no_codes: 1 } });
			const Novice = await factories.category.create({ tourn: Tourn.id, name: 'Novice' });
			await factories.judge.create({ person: Person.id, category: Open.id });
			await factories.judge.create({ person: Person.id, category: Novice.id });

			const records = await judgeRepo.getJudgeTournHistory(db, Person.id, Tourn.id);

			expect(records.map(r => [r.Category.name, r.noCodes])).toEqual([['Novice', false], ['Open', true]]);
			expect(records[0].School).toBeNull();
		});

		it('returns a tournament in progress, like the history list does', async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create({
				start: new Date(Date.now() - DAY),
				end: new Date(Date.now() + DAY),
			});
			const Category = await factories.category.create({ tourn: Tourn.id });
			const Judge = await factories.judge.create({ person: Person.id, category: Category.id });

			const records = await judgeRepo.getJudgeTournHistory(db, Person.id, Tourn.id);

			expect(records.map(r => r.id)).toEqual([Judge.id]);
		});

		it('returns nothing for a tournament that has not started or is hidden', async () => {
			const Person = await factories.person.create();
			const Upcoming = await factories.tourn.create({ start: new Date(Date.now() + DAY) });
			const Hidden = await factories.tourn.create({ start: new Date(Date.now() - DAY), hidden: 1 });
			for (const Tourn of [Upcoming, Hidden]) {
				const Category = await factories.category.create({ tourn: Tourn.id });
				await factories.judge.create({ person: Person.id, category: Category.id });
			}

			expect(await judgeRepo.getJudgeTournHistory(db, Person.id, Upcoming.id)).toEqual([]);
			expect(await judgeRepo.getJudgeTournHistory(db, Person.id, Hidden.id)).toEqual([]);
		});
	});
	describe('getLiveDocs', () => {
		it('returns the correct shape for livedocs', async () => {
			const tourn = await factories.tourn.create();
			const category = await factories.category.create({
				tourn: tourn.id,
				settings: {
					livedoc_url: 'example.com',
					livedoc_caption: 'example',
				},
			});
			const { Person, Judge } = await factories.person.createJudge({ Judge: { category: category.id }});
			const res = await judgeRepo.getLiveDocs(db, Person.id);

			const cat = category;

			expect(res).toBeInstanceOf(Array);
			expect(res.length).toBe(1);
			const livedoc = res[0];
			expect(livedoc).toEqual({
				judgeId: Judge.id,
				categoryAbbr: cat.abbr,
				tournName: tourn.name,
				tournEnd: tourn.end,
				tournTz: tourn.tz,
				url: 'example.com',
				caption: 'example',
			});
		});
		it('does not return tourns out of range', async () => {
			//only should return docs from tourns that have not ended and started within 7 days
			const tourn = await factories.tourn.create({ end: new Date(Date.now() - 10000) });
			const category = await factories.category.create({
				tourn: tourn.id,
				settings: {
					livedoc_url: 'example.com',
					livedoc_caption: 'example',
				},
			});
			const { Person } = await factories.person.createJudge({ Judge: { category: category.id }});
			const res = await judgeRepo.getLiveDocs(db, Person.id);

			expect(res).toBeInstanceOf(Array);
			expect(res.length).toBe(0);

			const tourn2 = await factories.tourn.create({ start: faker.date.past() });
			const category2 = await factories.category.create({
				tourn: tourn2.id,
				settings: {
					livedoc_url: 'example.com',
					livedoc_caption: 'example',
				},
			});
			const { Person: Person2 } = await factories.person.createJudge({ Judge: { category: category2.id }});
			const res2 = await judgeRepo.getLiveDocs(db, Person2.id);

			expect(res2).toBeInstanceOf(Array);
			expect(res2.length).toBe(0);
		});
		it('does not return hidden tourns', async () => {
			const tourn = await factories.tourn.create({ hidden: 1 });
			const category = await factories.category.create({
				tourn: tourn.id,
				settings: {
					livedoc_url: 'example.com',
					livedoc_caption: 'example',
				},
			});
			const { Person } = await factories.person.createJudge({ Judge: { category: category.id }});
			const res = await judgeRepo.getLiveDocs(db, Person.id);

			expect(res).toBeInstanceOf(Array);
			expect(res.length).toBe(0);
		});
		it('does not return results without a livedoc url', async () => {
			const tourn = await factories.tourn.create({ hidden: 1 });
			const category = await factories.category.create({
				tourn: tourn.id,
				settings: {
					livedoc_caption: 'example',
				},
			});
			const { Person } = await factories.person.createJudge({ Judge: { category: category.id }});
			const res = await judgeRepo.getLiveDocs(db, Person.id);

			expect(res).toBeInstanceOf(Array);
			expect(res.length).toBe(0);
		});
	});
});
