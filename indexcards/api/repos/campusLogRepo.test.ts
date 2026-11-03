import campusLogRepo from './campusLogRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('createCampusLog', () => {
	it('creates a campus log and returns it', async () => {
		const { Tourn } = await factories.tourn.createFull();

		const log = await campusLogRepo.createCampusLog(db, {
			tag: 'panel',
			tourn: Tourn.id,
			description: 'Entered PF A from Tabroom',
		});

		expect(log.tag).toBe('panel');
		expect(log.tourn).toBe(Tourn.id);
		expect(log.description).toBe('Entered PF A from Tabroom');

		const saved = await db.selectFrom('campus_log').where('id', '=', log.id).selectAll().executeTakeFirst();
		expect(saved?.description).toBe('Entered PF A from Tabroom');

		await db.deleteFrom('campus_log').where('id', '=', log.id).execute();
	});
});
