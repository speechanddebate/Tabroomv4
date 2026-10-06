
import schoolRepo from './schoolRepo.js';
import { db } from '../data/database.js';
import factories from '../../tests/factories/index.js';

describe('getSchool', () => {
	it('Returns null when school does not exist', async () => {
		const result = await schoolRepo.getSchool(db, 99999);
		expect(result).toBeUndefined();
	});
	it('Returns the school when it exists', async () => {
		const School = await factories.school.create();
		const result = await schoolRepo.getSchool(db, School.id);
		expect(result).toBeDefined();
		expect(result?.id).toBe(School.id);
	});
});
describe('getSchools', () => {
	it('Returns an array of schools', async () => {
		const Tourn = await factories.tourn.create();
		const School = await factories.school.create({ tourn: Tourn.id});
		const schools = await schoolRepo.getSchools(db, { tourn: Tourn.id });
		expect(Array.isArray(schools)).toBe(true);
		expect(schools).toContainEqual(
			expect.objectContaining({
				id: School.id,
			})
		);
	});
	it('applies scope filters from opts', async () => {
		const Chapter = await factories.chapter.create();
		const Tourn = await factories.tourn.create();
		const School = await factories.school.create({ chapter: Chapter.id, tourn: Tourn.id });
		const result = await schoolRepo.getSchools(db, { chapter: Chapter.id, tourn: Tourn.id });
		expect(result).toBeDefined();
		expect(result).toContainEqual(
			expect.objectContaining({
				id: School.id,
			})
		);
	});
});
describe('createSchool', () => {
	it('Creates a new school when given valid data', async () => {
		// Arrange
		const schoolData = {
			name: 'Test School',
			code: 'TS123',
			onsite: 1,
			settings: {
				contact: 500,
			},
		};

		// Act
		const created = await schoolRepo.createSchool(db, schoolData);

		// Assert
		expect(created).toBeDefined();

		const fetchedSchool = await schoolRepo.getSchool(db, created.id, { settings: true });
		expect(fetchedSchool).toBeDefined();
		expect(fetchedSchool?.name).toBe(schoolData.name);
		expect(fetchedSchool?.code).toBe(schoolData.code);
		expect(fetchedSchool?.onsite).toBe(1);
		expect(fetchedSchool?.settings?.contact).toEqual('500');

	});
	it('Creates a new school without settings when settings are not provided', async () => {
		// Arrange
		const schoolData = {
			name: 'No Settings School',
			code: 'NSS123',
			onsite: 1,
		};

		// Act
		const created = await schoolRepo.createSchool(db, schoolData);

		// Assert
		expect(created).toBeDefined();

		const fetchedSchool = await schoolRepo.getSchool(db, created.id, { settings: true });
		expect(fetchedSchool).toBeDefined();
		expect(fetchedSchool?.name).toBe(schoolData.name);
		expect(fetchedSchool?.code).toBe(schoolData.code);
		expect(fetchedSchool?.onsite).toBe(1);
		expect(fetchedSchool?.settings).toEqual(null);
	});
});
describe('updateSchool', () => {
	let createdId: number | undefined;

	beforeEach(async () => {
		// Create a school to update
		const schoolData = {
			name: 'Update Test School',
			code: 'UTS123',
			onsite: 1,
			settings: {
				contact: 600,
			},
		};
		({ id: createdId } = await schoolRepo.createSchool(db, schoolData));
	});

	it('Updates existing school fields', async () => {
		// Arrange
		const updateData = {
			name: 'Updated School Name',
			code: 'USN456',
			onsite: 0,
			settings: {
				some_setting: 'new_value'
			}
		};

		// Act
		await schoolRepo.updateSchool(db, createdId as number, updateData);

		// Assert
		const updatedSchool = await schoolRepo.getSchool(db, createdId as number, { settings: true });
		expect(updatedSchool?.name).toBe(updateData.name);
		expect(updatedSchool?.code).toBe(updateData.code);
		expect(updatedSchool?.onsite).toBe(0);
		expect(updatedSchool?.settings).toEqual({ contact: '600', some_setting: 'new_value' });
	});
	it('updates base table without affecting settings', async () => {
		// Arrange
		const updateData = {
			name: 'Base Table Update',
			code: 'BTU123',
			onsite: 0,
		};

		// Act
		await schoolRepo.updateSchool(db, createdId as number, updateData);

		// Assert
		const updatedSchool = await schoolRepo.getSchool(db, createdId as number, { settings: true });
		expect(updatedSchool?.name).toBe(updateData.name);
		expect(updatedSchool?.code).toBe(updateData.code);
		expect(updatedSchool?.onsite).toBe(0);
		expect(updatedSchool?.settings).toEqual({ contact: '600' }); // settings should remain unchanged
	});
	it('can update school settings independently', async () => {
		// Arrange
		const updateData = {
			settings: {
				contact: '800'
			}
		};

		// Act
		await schoolRepo.updateSchool(db, createdId as number, updateData);

		// Assert
		const updatedSchool = await schoolRepo.getSchool(db, createdId as number, { settings: true });
		expect(updatedSchool?.settings).toEqual({ contact: '800' });
	});
});
describe('deleteSchool', () => {
	let createdId: number | undefined;

	beforeEach(async () => {
		// Create a school to delete
		const schoolData = {
			name: 'Delete Test School',
			code: 'DTS123',
			onsite: 1,
			settings: {
				contact: 700,
			},
		};
	({ id: createdId } = await schoolRepo.createSchool(db, schoolData));
	});

	it('Deletes an existing school', async () => {
		await schoolRepo.deleteSchool(db, createdId as number);
		const fetchedSchool = await schoolRepo.getSchool(db, createdId as number);
		expect(fetchedSchool).toBeUndefined();
	});
});