
import factories from '../../tests/factories/index.js';
import categoryRepo from './categoryRepo.js';
import { db } from '../data/database.js';

describe('createCategory', () => {
	it('creates category when provided valid data', async () => {
		const category = {
			name: 'Test Category',
		};
		const result = await categoryRepo.createCategory(db,category);
		expect(result).toBeDefined();
		expect(result?.name).toBe(category.name);
	});
});
describe('getCategory', () => {
	it('retrieves category by id', async () => {
		const categoryData = factories.category.createCategoryData();
		const result = await categoryRepo.createCategory(db,categoryData);
		expect(result).toBeDefined();
		expect(result).toBeDefined();
		expect(result?.name).toBe(categoryData.name);
	});
	it('returns settings when requested', async () => {
		const categoryData = factories.category.createCategoryData();
		const settings = { someSetting: 'foobar' };
		const createdCategory = await categoryRepo.createCategory(db, { ...categoryData, settings });
		const result = await categoryRepo.getCategory(db, createdCategory.id, { settings: ['someSetting'] });
		expect(result).toBeDefined();
		expect(result?.settings?.someSetting).toBe('foobar');
	});
});
describe('getCategories', () => {
	it('retrieves all categories for a given tournament', async () => {
		const { tournId } = await factories.tourn.createTestTourn();
		const category1Data = factories.category.createCategoryData({ tourn: tournId, name: `Cat1 ${tournId}` });
		const category2Data = factories.category.createCategoryData({ tourn: tournId, name: `Cat2 ${tournId}` });

		await categoryRepo.createCategory(db,category1Data);
		await categoryRepo.createCategory(db,category2Data);
		const results = await categoryRepo.getCategories(db,{ tournId });
		expect(results).toBeDefined();
		expect(results.length).toBeGreaterThanOrEqual(2);

		expect(results).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ tourn: tournId }),
				expect.objectContaining({ tourn: tournId }),
			]),
		);
		expect(results.map(c => c.name)).toEqual(expect.arrayContaining([category1Data.name, category2Data.name]));
	});
});
describe('createCategory', () => {
	it('creates a new category and returns its id', async () => {
		const categoryData = factories.category.createCategoryData();
		const result = await categoryRepo.createCategory(db,categoryData);
		expect(result).toBeDefined();
		expect(result).not.toBeNull();
		expect(result?.name).toBe(categoryData.name);
	});
	it('creates a new category with settings', async () => {
		const categoryData = factories.category.createCategoryData();
		const settings = { someSetting: 'value' };
		const result = await categoryRepo.createCategory(db, { ...categoryData, settings });
		expect(result).toBeDefined();
		expect(result?.name).toBe(categoryData.name);
		const withSettings = await categoryRepo.getCategory(db, result.id, { settings: true });
		expect(withSettings).toBeDefined();
		expect(withSettings?.name).toBe(categoryData.name);
		expect(withSettings?.settings.someSetting).toEqual('value');
	});
});
describe('updateCategory', () => {
	it('updates an existing category', async () => {
		const categoryData = factories.category.createCategoryData();
		const result = await categoryRepo.createCategory(db,categoryData);
		expect(result).toBeDefined();

		const updatedData = { ...categoryData, name: `Updated ${categoryData.name}` };
		await categoryRepo.updateCategory(db,result.id, updatedData);

		const fetchedResult = await categoryRepo.getCategory(db,result.id);
		expect(fetchedResult).not.toBeNull();
		expect(fetchedResult?.name).toBe(updatedData.name);
	});
});
describe('deleteCategory', () => {
	it('deletes category by id', async () => {
		const categoryData = factories.category.createCategoryData();
		const result = await categoryRepo.createCategory(db,categoryData);
		expect(result).toBeDefined();
		const deleteResult = await categoryRepo.deleteCategory(db,result.id);
		expect(deleteResult).toBe(1);
		const fetchedResult = await categoryRepo.getCategory(db,result.id);
		expect(fetchedResult).toBeUndefined();
	});
});