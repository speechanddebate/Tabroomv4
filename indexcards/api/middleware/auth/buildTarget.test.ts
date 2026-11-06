import eventRepo from '../../repos/eventRepo.js';
import categoryRepo from '../../repos/categoryRepo.js';
import entryRepo from '../../repos/entryRepo.js';
import { buildTarget, type Target } from './buildTarget.js';
import { db } from '../../data/database.js';
import factories from '../../../tests/factories/index.js';

describe('buildTarget', () => {
	let targetCache: Map<string, Target>;

	beforeEach(() => {
		targetCache = new Map();
		vi.restoreAllMocks();
	});

	it('returns cached target if present', async () => {
		const cached: Target = { id: 123, resource: 'foo' };
		targetCache.set('foo:123', cached);

		const result = await buildTarget(db, 'foo', 123, targetCache);
		expect(result).toBe(cached);
	});

	it('target for tourn resource sets circuitIds', async () => {

		const result = await buildTarget(db, 'tourn', 456, targetCache);

		expect(result).toEqual({
			id: 456,
			resource: 'tourn',
		});
		expect(targetCache.get('tourn:456')).toEqual(result);
	});
	it('target for category resource sets tournId and circuitIds', async () => {
		vi.spyOn(categoryRepo, 'getCategory').mockResolvedValueOnce({ tourn: 1 } as Awaited<ReturnType<typeof categoryRepo.getCategory>>);

		const result = await buildTarget(db, 'category', 456, targetCache);

		expect(result).toEqual({
			id: 456,
			resource: 'category',
			tournId: 1,
		});
		expect(targetCache.get('category:456')).toEqual(result);
	});
	it('target for event resource sets categoryId, tournId and circuitIds', async () => {
		vi.spyOn(eventRepo, 'getEvent').mockResolvedValueOnce({
			tourn: 1,
			category: 10,
		} as Awaited<ReturnType<typeof eventRepo.getEvent>>);

		const result = await buildTarget(db, 'event', 456, targetCache);

		expect(result).toEqual({
			id: 456,
			resource: 'event',
			tournId: 1,
			categoryId: 10,
		});
		expect(targetCache.get('event:456')).toEqual(result);
	});
	it('target for an unpublished round still has its event and tourn, so tab staff keep access', async () => {
		const tourn = await factories.tourn.create();
		const category = await factories.category.create({ tourn: tourn.id });
		const event = await factories.event.create({ tourn: tourn.id, category: category.id });
		const round = await factories.round.create({ event: event.id, published: 0 });
		const panel = await factories.panel.create({ round: round.id });

		const result = await buildTarget(db, 'panel', panel.id, targetCache);

		expect(result).toMatchObject({ roundId: round.id, eventId: event.id, tournId: tourn.id });
	});

	describe('school and entry', () => {
		async function entryFixture() {
			const tourn = await factories.tourn.create();
			const category = await factories.category.create({ tourn: tourn.id });
			const event = await factories.event.create({ tourn: tourn.id, category: category.id });
			const chapter = await factories.chapter.create();
			const school = await factories.school.create({ tourn: tourn.id, chapter: chapter.id });
			const entry = await factories.entry.create({ event: event.id, school: school.id });
			return { tourn, category, event, chapter, school, entry };
		}

		it('a school target has its chapter and tourn', async () => {
			const { tourn, chapter, school } = await entryFixture();

			const result = await buildTarget(db, 'school', school.id, targetCache);

			expect(result).toEqual({ id: school.id, resource: 'school', chapterId: chapter.id, tournId: tourn.id });
		});

		it('an entry target has its school chain and its event chain', async () => {
			const { tourn, category, event, chapter, school, entry } = await entryFixture();

			const result = await buildTarget(db, 'entry', entry.id, targetCache);

			expect(result).toEqual({
				id: entry.id,
				resource: 'entry',
				schoolId: school.id,
				chapterId: chapter.id,
				eventId: event.id,
				categoryId: category.id,
				tournId: tourn.id,
			});
		});

		it("takes the entry's tourn from its event, not its school", async () => {
			const { tourn, event } = await entryFixture();
			const otherTourn = await factories.tourn.create();
			const school = await factories.school.create({ tourn: otherTourn.id });
			const entry = await factories.entry.create({ event: event.id, school: school.id });

			const result = await buildTarget(db, 'entry', entry.id, targetCache);

			expect(result.tournId).toBe(tourn.id);
		});

		it.each(['school', 'entry'])('a missing %s has no parents', async (resource) => {
			const result = await buildTarget(db, resource, 999999999, targetCache);

			expect(result).toEqual({ id: 999999999, resource });
		});

		it('caches the entry and its parents', async () => {
			const { event, school, entry } = await entryFixture();

			const result = await buildTarget(db, 'entry', entry.id, targetCache);

			expect(targetCache.get(`entry:${entry.id}`)).toBe(result);
			expect(targetCache.has(`school:${school.id}`)).toBe(true);
			expect(targetCache.has(`event:${event.id}`)).toBe(true);
			vi.spyOn(entryRepo, 'getEntry');
			expect(await buildTarget(db, 'entry', entry.id, targetCache)).toBe(result);
			expect(entryRepo.getEntry).not.toHaveBeenCalled();
		});
	});
});