import eventRepo from './eventRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('eventRepo', () => {
	describe('getEvents', () => {
		it('returns only the events with the given ids', async () => {
			const [a, , c] = await Promise.all([1, 2, 3].map(() => factories.event.create()));

			const events = await eventRepo.getEvents(db, { ids: [a.id, c.id] });

			expect(events.map((event) => event.id).sort()).toEqual([a.id, c.id].sort());
		});

		// Regression: an empty ids list used to drop the filter and return every event
		it('returns no events for an empty ids list', async () => {
			await factories.event.create();

			expect(await eventRepo.getEvents(db, { ids: [] })).toEqual([]);
		});
	});
});
