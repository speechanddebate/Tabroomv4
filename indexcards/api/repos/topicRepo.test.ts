import topicRepo from './topicRepo.js';
import { db } from '../data/database.js';

describe('topicRepo', () => {
	describe('getTopic', () => {
		it('retrieves a topic by id', async () => {
			const { insertId } = await db.insertInto('topic')
				.values({ tag: 'test', topic_text: 'Resolved: tests are good.' })
				.executeTakeFirstOrThrow();

			const topic = await topicRepo.getTopic(db, Number(insertId));

			expect(topic?.topic_text).toBe('Resolved: tests are good.');
		});

		it('returns undefined for a missing topic', async () => {
			expect(await topicRepo.getTopic(db, 999_999_999)).toBeUndefined();
		});
	});
});
