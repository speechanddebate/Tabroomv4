import chapterJudgeRepo from './chapterJudgeRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('getChapterJudge', () => {
	it('retrieves a chapter judge by ID', async () => {
		const cj = await factories.chapterJudge.create();
		const found = await chapterJudgeRepo.getChapterJudge(db, cj.id);
		expect(found).toBeDefined();
		expect(found!.id).toBe(cj.id);
		expect(found!.first).toBe(cj.first);
		expect(found!.last).toBe(cj.last);
	});
});
describe('getChapterJudges', () => {
	it('retrieves all chapter judges for a person', async () => {
		const Person = await factories.person.create();
		const cj = await factories.chapterJudge.create({ person: Person.id});
		const cj2 = await factories.chapterJudge.create({ person: Person.id });
		const results = await chapterJudgeRepo.getChapterJudges(db, { person: Person.id });
		expect(results).toHaveLength(2);
		expect(results.map(r => r.id)).toContain(cj.id);
		expect(results.map(r => r.id)).toContain(cj2.id);
	});
	it('retrieves all chapter judges a person has requested', async () => {
		const requester = await factories.person.create();
		const cj = await factories.chapterJudge.create({ person_request: requester.id });
		const results = await chapterJudgeRepo.getChapterJudges(db, { person_request: requester.id });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(cj.id);
	});
	it('applies limit and offset correctly', async () => {
		const Person = await factories.person.create();
		await factories.chapterJudge.create({ person: Person.id });
		const cj2 = await factories.chapterJudge.create({ person: Person.id });
		const results = await chapterJudgeRepo.getChapterJudges(db, { person: Person.id, limit: 1, offset: 1 });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(cj2.id);
	});
});
describe('updateChapterJudge', () => {
	it('updates a chapter judge by ID', async () => {
		const cj = await factories.chapterJudge.create();
		const updatedData = { first: 'UpdatedFirst', last: 'UpdatedLast' };
		await chapterJudgeRepo.updateChapterJudge(db, cj.id, updatedData);
		const found = await chapterJudgeRepo.getChapterJudge(db, cj.id);
		expect(found).toBeDefined();
		expect(found!.first).toBe(updatedData.first);
		expect(found!.last).toBe(updatedData.last);
	});
});
describe('unlinkedSearch', () => {

	it('returns unlinked chapter judges with chapter name and tourn count', async () => {
		const cj = await factories.chapterJudge.create();
		const chapterJudgeId = cj.id;

		const tourn = await factories.tourn.create();
		const category = await factories.category.create({ tourn: tourn.id });
		await factories.judge.create({ chapter_judge: chapterJudgeId, category: category.id });

		const results = await chapterJudgeRepo.unlinkedSearch(db,{ first: cj.first, last: cj.last });

		const found = results.find(r => r.id === chapterJudgeId);
		expect(found).toBeDefined();
		expect(found!.first).toBe(cj.first);
		expect(found!.last).toBe(cj.last);
		expect(found!.chapter_name).toBeDefined();
		expect(Number(found!.tourn_count)).toBeGreaterThanOrEqual(1);
	});

	it('counts distinct tournaments across multiple judge records', async () => {
		const cj = await factories.chapterJudge.create();
		const chapterJudgeId = cj.id;

		const tourn1 = await factories.tourn.create();
		const tourn2 = await factories.tourn.create();
		const cat1 = await factories.category.create({ tourn: tourn1.id });
		const cat2 = await factories.category.create({ tourn: tourn2.id });

		await factories.judge.create({ chapter_judge: chapterJudgeId, category: cat1.id });
		await factories.judge.create({ chapter_judge: chapterJudgeId, category: cat2.id });

		const results = await chapterJudgeRepo.unlinkedSearch(db,{ first: cj.first, last: cj.last });

		const found = results.find(r => r.id === chapterJudgeId);
		expect(found).toBeDefined();
		expect(Number(found!.tourn_count)).toBeGreaterThanOrEqual(2);
	});

	it('excludes rows requested by the excluded person', async () => {
		const requesterId = (await factories.person.create()).id;
		const otherRequesterId = (await factories.person.create()).id;

		const included = await factories.chapterJudge.create({
			first: 'River',
			last: 'Unlinked',
			person_request: otherRequesterId,
		});
		const excluded = await factories.chapterJudge.create({
			first: 'River',
			last: 'Unlinked',
			person_request: requesterId,
		});

		const results = await chapterJudgeRepo.unlinkedSearch(db,{
			first: 'River', last: 'Unlinked' },
			{ notRequestedBy: requesterId }
		);

		const resultIds = results.map(r => r.id);
		expect(resultIds).toContain(included.id);
		expect(resultIds).not.toContain(excluded.id);
	});

	it('includes chapter judges with no person_request when notRequestedBy is set', async () => {
		const requester = await factories.person.create();

		const cj = await factories.chapterJudge.create({
			first: 'Morgan',
			last: 'Norequest',
			person_request: null,
		});

		const results = await chapterJudgeRepo.unlinkedSearch(db,{
			first: 'Morgan', last: 'Norequest' },
			{ notRequestedBy: requester.id }
		);

		expect(results.map(r => r.id)).toContain(cj.id);
	});
});
