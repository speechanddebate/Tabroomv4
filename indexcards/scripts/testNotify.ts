#!/usr/bin/env node
// Calls notify() for a few people so the notify queue can be watched end to end.
// The job runs on whichever worker is up, e.g. the indexcards-dev container: docker logs -f indexcards-dev
//
//   npx tsx scripts/testNotify.ts                 the first 5 people in the database, inbox only
//   npx tsx scripts/testNotify.ts 1 2 3           those person ids, skipping any that don't exist
//   npx tsx scripts/testNotify.ts --email 1 2 3   also queue an email job per person (watch Mailpit at localhost:8025)
//   npx tsx scripts/testNotify.ts --push 1 2 3    also queue a push job per person
import { db } from '../api/data/database.js';
import logger from '../api/helpers/logger.js';
import { notify } from '../api/services/notifications/notify.js';
import { stopQueues } from '../api/services/queue/index.js';

const args = process.argv.slice(2);
const channels = {
	inbox: true,
	email: args.includes('--email'),
	webpush: args.includes('--push'),
};
const requested = args.filter((arg) => !arg.startsWith('--')).map(Number);

try {
	// Always query: destroying a pool that never ran a query leaves the process hanging
	const people = await db.selectFrom('person')
		.select('id')
		.$if(requested.length > 0, (query) => query.where('id', 'in', requested))
		.orderBy('id')
		.limit(requested.length || 5)
		.execute();
	const ids = people.map((person) => person.id);

	const missing = requested.filter((id) => !ids.includes(id));
	if (missing.length > 0) {
		logger.warn(`Skipping people that don't exist: ${missing.join(', ')}`);
	}
	if (ids.length === 0) {
		throw new Error('No people to notify');
	}

	const response = await notify({
		ids,
		text: 'Test notification from scripts/testNotify.ts',
		// The request schema requires these keys, even when null
		subject: 'Test notification',
		body: null,
		url: '/user/home',
		from: 'Tab <tab@tabroom.com>',
		channels,
	} as unknown as Parameters<typeof notify>[0]);

	logger.info(`notify() for people ${ids.join(', ')}: ${response.message}`);
} catch (err) {
	logger.error('Test notify failed', err);
	process.exitCode = 1;
} finally {
	await stopQueues();
	await db.destroy();
}
