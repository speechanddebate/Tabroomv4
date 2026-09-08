
import permissionRepo from './permissionRepo.js';
import { db } from '../data/database.js';
import factories from '../../tests/factories/index.js';

let { personId } = await factories.person.create();

describe('permissionRepo', () => {
	beforeAll(async () => {
		({ personId } = await factories.person.create());
	});

	describe('getPermission', () => {
		it('should return a permission for a given id', async () => {
			const permissionId = await permissionRepo.createPermission(db,{ person: personId, tag: 'chapter' });
			const permission = await permissionRepo.getPermission(db, permissionId);
			expect(permission).toBeDefined();
			expect(permission?.id).toBe(permissionId);
			expect(permission?.person).toBe(personId);
		});
	});
	describe('getPermissions', () => {
		it('should return permissions for a given personId', async () => {
			const permissionId = await permissionRepo.createPermission(db, { person: personId, tag: 'chapter' });
			const permissions = await permissionRepo.getPermissions(db, { person: personId });
			expect(Array.isArray(permissions)).toBe(true);
			expect(permissions.length).toBeGreaterThan(0);
			const found = permissions.find(b => b.id === permissionId);
			expect(found).toBeDefined();
			expect(found?.person).toBe(personId);
		});

		it('should return permissions for a given tournId', async () => {
			const tourn = await factories.tourn.createFull();
			const permissionId = await permissionRepo.createPermission(db, { person: personId, tourn: tourn.tournId, tag: 'owner' });
			const permissions = await permissionRepo.getPermissions(db, { tourn: tourn.tournId });
			expect(Array.isArray(permissions)).toBe(true);
			expect(permissions.length).toBeGreaterThan(0);
			const found = permissions.find(b => b.id === permissionId);
			expect(found).toBeDefined();
			expect(found?.tourn).toBe(tourn.tournId);
		});
		it('should return permissions for a given chapterId', async () => {
			const chapter = await factories.chapter.create();
			const permissionId = await permissionRepo.createPermission(db, { person: personId, chapter: chapter.chapterId, tag: 'owner' });
			const permissions = await permissionRepo.getPermissions(db, { chapter: chapter.chapterId });
			expect(Array.isArray(permissions)).toBe(true);
			expect(permissions.length).toBeGreaterThan(0);
			const found = permissions.find(b => b.id === permissionId);
			expect(found).toBeDefined();
			expect(found?.chapter).toBe(chapter.chapterId);
		});
	});
	describe('createPermission', () => {
		it('should create a permission and retrieve it', async () => {
			const permissionId = await permissionRepo.createPermission(db, { 
				person: personId,
				tag: 'owner',
			});
			expect(permissionId).toBeDefined();
			expect(typeof permissionId).toBe('number');
			const permission = await permissionRepo.getPermission(db, permissionId);

			//ensure that id, updatedAt and createdAt are present and not null
			expect(permission).toHaveProperty('id');
			expect(permission?.id).not.toBeNull();
		});
	});

});