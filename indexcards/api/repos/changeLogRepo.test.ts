import changeLogRepo from './changeLogRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';
describe('getChangeLog', () => {
	it('fetches a changelog with a given id', async () => {
		const changeLog = await factories.changeLog.create({ description: 'Test Change Log' });
		const fetchedChangeLog = await changeLogRepo.getChangeLog(db, changeLog.id);
		expect(fetchedChangeLog).toBeTruthy();
		expect(fetchedChangeLog!.description).toBe('Test Change Log');
	});
	it('returns undefined if no changelog is found', async () => {
		const changeLog = await changeLogRepo.getChangeLog(db, 999999);
		expect(changeLog).toBeUndefined();
	});
});
describe('createChangeLog', () => {
	it('creates a changelog and returns its id', async () => {
		const changeLogData = { description: 'New Change Log' };
		const createdChangeLog = await changeLogRepo.createChangeLog(db, changeLogData);
		expect(createdChangeLog).toBeTruthy();
		const fetchedChangeLog = await changeLogRepo.getChangeLog(db, createdChangeLog!.id);
		expect(fetchedChangeLog).toBeTruthy();
		expect(fetchedChangeLog!.description).toBe('New Change Log');
	});
});