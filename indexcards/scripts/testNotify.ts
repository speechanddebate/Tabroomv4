#!/usr/bin/env node
// Calls notify() for a few people so the notify queue can be watched end to end.
// The job runs on whichever worker is up, e.g. the indexcards-dev container: docker logs -f indexcards-dev
//
//   npx tsx scripts/testNotify.ts                 the first 5 people in the database, inbox only
//   npx tsx scripts/testNotify.ts 1 2 3           those person ids, skipping any that don't exist
//   npx tsx scripts/testNotify.ts --email 1 2 3   also queue an email job per person (watch Mailpit at localhost:8025)
//   npx tsx scripts/testNotify.ts --push 1 2 3    also queue a push job per person
//   npx tsx scripts/testNotify.ts --email --tourn 42 1 2   as tournament 42's staff: html with markup the sanitizer strips, and the tournament footer
import { db } from '../api/data/database.js';
import logger from '../api/helpers/logger.js';
import { notify } from '../api/services/notifications/notify.js';
import { stopQueues } from '../api/services/queue/index.js';

const args = process.argv.slice(2);
const channels = {
	inbox: true,
	email: args.includes('--email'),
	push: args.includes('--push'),
};
const tournAt = args.indexOf('--tourn');
const tourn = tournAt >= 0 ? Number(args[tournAt + 1]) : undefined;
const requested = args.filter((arg, i) => !arg.startsWith('--') && (tournAt < 0 || i !== tournAt + 1)).map(Number);

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
		...(tourn
			? {
				kind: 'tourn',
				tourn,
				// The div, image, script, class, and javascript: link are what the sanitizer must strip
				html: '<div class="x"><p>Rounds start at <b>8:00 a.m.</b> in <span style="color: #ba1d00; position: absolute;">Room 12</span>.</p>'
					+ '<img src="https://example.com/pixel.gif"><script>alert(1)</script>'
					+ '<p><a href="javascript:alert(1)">Bad link</a> · <a href="https://www.tabroom.com">Good link</a></p></div>',
			}
			: { text: 'Test notification from scripts/testNotify.ts' }),
		subject: tourn ? 'Test tournament message' : 'Test notification',
		url: '/user/home',
		channels,
	});

	logger.info(`notify() for people ${ids.join(', ')}: queued ${response.jobs.email} email and ${response.jobs.push} push job(s)`);
} catch (err) {
	logger.error('Test notify failed', err);
	process.exitCode = 1;
} finally {
	await stopQueues();
	await db.destroy();
}
