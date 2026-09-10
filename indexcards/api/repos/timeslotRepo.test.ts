import timeslotRepo from './timeslotRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('TimeslotRepo', () => {
	describe('getTimeslot', () => {
		it('retrieves timeslot by id', async () => {
			const timeslotData = factories.timeslot.createTimeslotData();
			const result = await timeslotRepo.createTimeslot(db,timeslotData);
			expect(result).toBeDefined();
			const result2 = await timeslotRepo.getTimeslot(db, result.id);
			expect(result2).toBeDefined();
			expect(result2?.name).toBe(timeslotData.name);
		});
	});
	describe('getTimeslots', () => {
		it('retrieves all timeslots for a given tourn', async () => {
			const { tournId } = await factories.tourn.createTestTourn();
			const timeslot1 = await factories.timeslot.create({ tourn: tournId });
			const timeslot2= await factories.timeslot.create({ tourn: tournId });

			const results = await timeslotRepo.getTimeslots(db, tournId);
			expect(results).toBeDefined();
			expect(results.length).toBe(2);
			expect(results.map(s => s.id)).toEqual(expect.arrayContaining([timeslot1.id, timeslot2.id]));

		});
	});
	describe('createTimeslot', () => {
		it('creates timeslot when provided valid data', async () => {
			const timeslot = factories.timeslot.createTimeslotData();
			const result = await timeslotRepo.createTimeslot(db, timeslot);
			expect(result).toBeDefined();
			const fetched = await timeslotRepo.getTimeslot(db, result.id);
			expect(fetched).toBeDefined();
			expect(fetched?.name).toBe(timeslot.name);
			expect(fetched?.start?.getTime()).toBe(timeslot.start.getTime());
		});
	});
	describe('updateTimeslot', () => {
		it('updates timeslot when provided valid data', async () => {
			const timeslot = await factories.timeslot.create();
			const newData = factories.timeslot.createTimeslotData({name: 'new timeslot name'});
			const result = await timeslotRepo.updateTimeslot(db, timeslot.id, newData);
			const updated = await timeslotRepo.getTimeslot(db, timeslot.id);
			expect(result.numUpdatedRows).toBe(1n);
			expect(updated).toBeDefined();
			expect(updated?.name).toBe('new timeslot name');
		});
	});
	describe('deleteTimeslot', () => {
		it('deletes a timeslot and returns true', async () => {
			// Arrange
			const timeslot = await factories.timeslot.create();
			// Act
			const result = await timeslotRepo.deleteTimeslot(db, timeslot.id);
			// Assert
			expect(result).toBe(true);
			const deleted = await timeslotRepo.getTimeslot(db,timeslot.id);
			expect(deleted).toBeUndefined();
		});
		it('returns false when trying to delete a non-existent timeslot', async () => {
			const result = await timeslotRepo.deleteTimeslot(db, 999999); // unlikely timeslotId
			expect(result).toBe(false);
		});
	});
});