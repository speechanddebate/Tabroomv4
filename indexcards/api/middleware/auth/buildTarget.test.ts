import eventRepo from '../../repos/eventRepo.js';
import categoryRepo from '../../repos/categoryRepo.js';
import { buildTarget, type Target } from './buildTarget.js';
import { db } from '../../data/database.js';

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
});