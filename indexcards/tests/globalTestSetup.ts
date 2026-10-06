import { sql } from 'kysely';
import { db } from '../api/data/database.js';
import config from '../api/config.js';
import logger from '../api/helpers/logger.js';
import testData from './testFixtures.js';

const pruneTestData = async () => {
	await db.deleteFrom('session').where('person', '>', 3).where('person', '<', 100).execute();
	await db.deleteFrom('campus_log').where('id', '<', 100).execute();
	await db.deleteFrom('campus_log').where('person', '>', 3).where('person', '<', 100).execute();
	await db.deleteFrom('person').where('id', '>', 3).where('id', '<', 100).execute();
};

export const setup = async () => {
	try {
		// Ensure database connection first
		await sql`SELECT 1`.execute(db);

		const tourncount = await db.selectFrom('tourn')
			.select((eb) => eb.fn.countAll().as('count'))
			.executeTakeFirst();

		if (Number(tourncount?.count) >= 10) {

			// Prune before the recreation because of unique keys
			await pruneTestData();

			// Must pause here because a lot of the third batch relies on foreign
			// keys in here.
			await Promise.all([
				db.insertInto('person').values(testData.testUser).execute(),
				db.insertInto('person').values(testData.testAdmin).execute(),
				db.insertInto('ad').values(testData.testAd).execute(),
				db.updateTable('person').set({ nsda: 123456 }).where('id', '=', 123215).execute(),
				db.updateTable('school').set({ name: 'Navy' }).where('id', '=', 651034).execute(),
				db.updateTable('judge').set({ first: 'Danielle', last: `O'Gorman` }).where('id', '=', 2155790).execute(),
				db.updateTable('entry').set({ code: 'Navy XX' }).where('id', '=', 5388933).execute(),
			]);

			await Promise.all([
				db.insertInto('session').values(testData.testUserSession).execute(),
				db.insertInto('permission').values(testData.testUserTournPerm).execute(),
				db.insertInto('session').values(testData.testAdminSession).execute(),
				db.insertInto('person').values(testData.testCampusUsers).execute(),
			]);

			logger.info(`Test data properly loaded and ready to run`);
			return;
		}

		logger.error(`Database ${config.db.database} is not loaded with the proper test data `);
		logger.error(`Test data should live in a separate database connected via the test env `);
		logger.error(`and loaded from /indexcards/test/test.sql.  Yes this is a lazy way to do it, but `);
		logger.error(`until Tabroom has six developers working with me, that's how it's gonna be.`);

		logger.error(`I expected 10 tournaments and found ${tourncount?.count}`);

		logger.error(`Someday I might automate this but node and command line shells don't play well together.`);

		throw new Error('No test data found');
	} catch (error) {
		logger.error('Global test setup failed', error);
		throw error;
	}
};

export const teardown = async () => {

	logger.info(`Cleanup commencing`);

	await pruneTestData();
	await db.deleteFrom('ad').where('id', '<', 2).execute();

	logger.info(`Cleanup done`);
	logger.info('Closing database connections...');
	await db.destroy();
};
