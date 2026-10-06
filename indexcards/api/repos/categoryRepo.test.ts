
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
		const tourn = await factories.tourn.create();
		const category1Data = factories.category.createCategoryData({ tourn: tourn.id, name: `Cat1 ${tourn.id}` });
		const category2Data = factories.category.createCategoryData({ tourn: tourn.id, name: `Cat2 ${tourn.id}` });

		await categoryRepo.createCategory(db,category1Data);
		await categoryRepo.createCategory(db,category2Data);
		const results = await categoryRepo.getCategories(db,{ tourn: tourn.id });
		expect(results).toBeDefined();
		expect(results.length).toBeGreaterThanOrEqual(2);

		expect(results).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ tourn: tourn.id }),
				expect.objectContaining({ tourn: tourn.id }),
			]),
		);
		expect(results.map(c => c.name)).toEqual(expect.arrayContaining([category1Data.name, category2Data.name]));
	});
});
describe('createCategory', () => {
	it('Creates a new category when given valid data', async () => {
		// Arrange
		const categoryData = {
			name: 'Test Category',
			settings: {
				contact: 500,
			},
		};

		// Act
		const Created = await categoryRepo.createCategory(db, categoryData);

		// Assert
		expect(Created).toBeDefined();

		const fetchedCategory = await categoryRepo.getCategory(db, Created.id, { settings: true });
		expect(fetchedCategory).toBeDefined();
		expect(fetchedCategory?.name).toBe(categoryData.name);
		expect(fetchedCategory?.settings?.contact).toEqual('500');

	});
	it('Creates a new category without settings when settings are not provided', async () => {
		// Arrange
		const categoryData = {
			name: 'No Settings Category',
		};

		// Act
		const Created = await categoryRepo.createCategory(db, categoryData);

		// Assert
		expect(Created).toBeDefined();

		const fetchedCategory = await categoryRepo.getCategory(db, Created.id, { settings: true });
		expect(fetchedCategory).toBeDefined();
		expect(fetchedCategory?.name).toBe(categoryData.name);
		expect(fetchedCategory?.settings).toEqual(null);
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
	it('updates an existing category with new settings', async () => {
		const categoryData = factories.category.createCategoryData();
		const result = await categoryRepo.createCategory(db,categoryData);
		expect(result).toBeDefined();

		const updatedData = { settings: { contact: 1000 } };
		await categoryRepo.updateCategory(db,result.id, updatedData);

		const fetchedResult = await categoryRepo.getCategory(db,result.id, { settings: true });
		expect(fetchedResult).not.toBeNull();
		expect(fetchedResult?.settings?.contact).toEqual('1000');
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