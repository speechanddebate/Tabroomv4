
import tournRepo from './tournRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('tournRepo', () => {
	describe('buildTournQuery', () => {
		it('does not include hidden tourns by default', async () => {
			const tournData = factories.tourn.createTournData({ hidden: 1 });
			const tourn = await tournRepo.createTourn(db,tournData);

			const fetchedTourn = await tournRepo.getTourn(db, tourn.id);

			expect(fetchedTourn).toBeUndefined();
		});
		it('includes hidden tourns when specified', async () => {
			const tournData = factories.tourn.createTournData({ hidden: 1 });
			const tourn = await tournRepo.createTourn(db, tournData);

			const fetchedTourn = await tournRepo.getTourn(db, tourn.id, { unpublished: true });

			expect(fetchedTourn).toBeDefined();
			expect(fetchedTourn?.id).toBe(tourn.id);
		});
		it('includes settings when specified', async () => {
			const settings = { testSetting: 'testValue' };
			const tourn = await factories.tourn.create({ settings });

			const fetchedTourn = await tournRepo.getTourn(db, tourn.id, { settings: true });

			expect(fetchedTourn).toBeDefined();
			expect(fetchedTourn?.settings).toBeDefined();
			expect(fetchedTourn?.settings!.testSetting).toBe(settings.testSetting);
		});
		it('applies limit and offset when specified', async () => {
			await factories.tourn.create();
			await factories.tourn.create();

			const tourn = await tournRepo.getTourns(db,{ limit: 1, offset: 0 });
			expect(tourn).toBeDefined();
			expect(tourn.length).toBe(1);
			const tourn2 = await tournRepo.getTourns(db,{ limit: 1, offset: 1 });
			expect(tourn2).toBeDefined();
			expect(tourn2.length).toBe(1);
			expect(tourn2[0].id).not.toBe(tourn[0].id);
		});
		it.todo('applies hasPublishedResults when specified', async () => {
			const tournData = factories.tourn.createTournData();
			const tourn = await tournRepo.createTourn(db, tournData);
			const fetchedTourn = await tournRepo.getTourn(db, tourn.id, { hasPublishedResults: true });
			expect(fetchedTourn).toBeUndefined();

		});

	});
	
	describe('getTourn', () => {
		it('retrieves tourn by id', async () => {
			const tournData = factories.tourn.createTournData();
			const tourn = await tournRepo.createTourn(db,tournData);
			expect(tourn).toBeDefined();
			const result = await tournRepo.getTourn(db, tourn.id);
			expect(result).toBeDefined();
			expect(result?.name).toBe(tournData.name);
		});
		it('retrieves tourn by webname', async () => {
			const tournData = factories.tourn.createTournData();
			const tourn = await tournRepo.createTourn(db, tournData);
			expect(tourn).toBeDefined();
			const result = await tournRepo.getTourn(db, tournData.webname!);
			expect(result).toBeDefined();
		});
		it('returns undefined if tourn not found', async () => {
			const result = await tournRepo.getTourn(db, 999999);
			expect(result).toBeUndefined();
		});
	});
	describe('createTourn', () => {
		it('creates a tourn', async () => {
			const tournData = factories.tourn.createTournData();
			const tourn = await tournRepo.createTourn(db, tournData);
			expect(tourn).toBeDefined();
			const result = await tournRepo.getTourn(db, tourn.id);
			expect(result).toBeDefined();
			expect(result?.name).toBe(tournData.name);
		});
		it('creates a tourn with settings', async () => {
			const tournData = factories.tourn.createTournData({ settings: { testSetting: 'testValue' } });
			const tourn = await tournRepo.createTourn(db, tournData);
			expect(tourn).toBeDefined();
			const result = await tournRepo.getTourn(db, tourn.id, { settings: true });
			expect(result).toBeDefined();
			expect(result!.settings).toBeDefined();
			expect(result!.settings!.testSetting).toBe(tournData.settings!.testSetting);
		});
	});
	describe('updateTourn', () => {
		it('updates a tourn', async () => {
			const tourn = await factories.tourn.create();
			const updates = { name: 'Updated Tournament Name' };
			await tournRepo.updateTourn(db, tourn.id, updates);

			const updatedTourn = await tournRepo.getTourn(db, tourn.id);
			expect(updatedTourn?.name).toBe(updates.name);
		});
		it('updates settings when provided', async () => {
			const data = factories.tourn.createTournData({ settings: { testSetting: 'oldValue' } });
			const tourn = await tournRepo.createTourn(db, data);
			const updates = { ...data, settings: { testSetting: 'newValue' } };
			await tournRepo.updateTourn(db, tourn.id, updates);

			const updatedTourn = await tournRepo.getTourn(db, tourn.id, { settings: true });
			expect(updatedTourn?.settings).toBeDefined();
			expect(updatedTourn?.settings!.testSetting).toBe(updates.settings.testSetting);
		});
	});
	describe('deleteTourn', () => {
		it('deletes a tourn', async () => {
			const tourn = await factories.tourn.create();
			await tournRepo.deleteTourn(db, tourn.id);
			const deletedTourn = await tournRepo.getTourn(db, tourn.id);
			expect(deletedTourn).toBeUndefined();
		});
	});
});