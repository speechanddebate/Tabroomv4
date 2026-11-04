
import permissionRepo from './permissionRepo.js';
import { db } from '../data/database.js';
import factories from '../../tests/factories/index.js';

let Person = await factories.person.create();
beforeAll(async () => {
	Person = await factories.person.create();
});

describe('getPermission', () => {
	it('should return a permission for a given id', async () => {
		const permissionId = await permissionRepo.createPermission(db,{ person: Person.id, tag: 'chapter' });
		const permission = await permissionRepo.getPermission(db, permissionId);
		expect(permission).toBeDefined();
		expect(permission?.id).toBe(permissionId);
		expect(permission?.person).toBe(Person.id);
	});
});
describe('getPermissions', () => {
	it('should return permissions for a given personId', async () => {
		const permissionId = await permissionRepo.createPermission(db, { person: Person.id, tag: 'chapter' });
		const permissions = await permissionRepo.getPermissions(db, { person: Person.id });
		expect(Array.isArray(permissions)).toBe(true);
		expect(permissions.length).toBeGreaterThan(0);
		const found = permissions.find(b => b.id === permissionId);
		expect(found).toBeDefined();
		expect(found?.person).toBe(Person.id);
	});

	it('should return permissions for a given tournId', async () => {
		const tourn = await factories.tourn.createFull();
		const permissionId = await permissionRepo.createPermission(db, { person: Person.id, tourn: tourn.Tourn.id, tag: 'owner' });
		const permissions = await permissionRepo.getPermissions(db, { tourn: tourn.Tourn.id });
		expect(Array.isArray(permissions)).toBe(true);
		expect(permissions.length).toBeGreaterThan(0);
		const found = permissions.find(b => b.id === permissionId);
		expect(found).toBeDefined();
		expect(found?.tourn).toBe(tourn.Tourn.id);
	});
	it('should return permissions for a given chapterId', async () => {
		const Chapter = await factories.chapter.create();
		const permissionId = await permissionRepo.createPermission(db, { person: Person.id, chapter: Chapter.id, tag: 'owner' });
		const permissions = await permissionRepo.getPermissions(db, { chapter: Chapter.id });
		expect(Array.isArray(permissions)).toBe(true);
		expect(permissions.length).toBeGreaterThan(0);
		const found = permissions.find(b => b.id === permissionId);
		expect(found).toBeDefined();
		expect(found?.chapter).toBe(Chapter.id);
	});
});
describe('createPermission', () => {
	it('should create a permission and retrieve it', async () => {
		const permissionId = await permissionRepo.createPermission(db, { 
			person: Person.id,
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
describe('getPermissions with tourns', () => {
	it("returns the person's permissions at the given tournaments", async () => {
		const Person = await factories.person.create();
		const first = await factories.tourn.create();
		const second = await factories.tourn.create();
		const elsewhere = await factories.tourn.create();
		const { permissionId: tabber } = await factories.permission.create({ person: Person.id, tourn: first.id, tag: 'tabber', details: '{"events":[1]}' });
		const { permissionId: owner } = await factories.permission.create({ person: Person.id, tourn: second.id, tag: 'owner' });
		await factories.permission.create({ person: Person.id, tourn: elsewhere.id, tag: 'owner' });
		// a chapter permission has no tourn, and another person's tourn permission is not mine
		const Chapter = await factories.chapter.create();
		await factories.permission.create({ person: Person.id, chapter: Chapter.id, tag: 'chapter' });
		await factories.permission.create({ tourn: first.id, tag: 'owner' });

		const rows = await permissionRepo.getPermissions(db, { person: Person.id, tourns: [first.id, second.id] });

		expect(rows.map(row => row.id).sort()).toEqual([tabber, owner].sort());
		expect(rows.find(row => row.id === tabber)).toMatchObject({
			tag: 'tabber',
			details: '{"events":[1]}',
			tourn: first.id,
		});
	});
});
describe('getPermissions with chapters', () => {
	it("returns the person's permissions at the given chapters", async () => {
		const Person = await factories.person.create();
		const first = await factories.chapter.create();
		const second = await factories.chapter.create();
		const elsewhere = await factories.chapter.create();
		const { permissionId: coach } = await factories.permission.create({ person: Person.id, chapter: first.id, tag: 'chapter' });
		const { permissionId: prefs } = await factories.permission.create({ person: Person.id, chapter: second.id, tag: 'prefs' });
		await factories.permission.create({ person: Person.id, chapter: elsewhere.id, tag: 'chapter' });
		await factories.permission.create({ chapter: first.id, tag: 'chapter' });

		const rows = await permissionRepo.getPermissions(db, { person: Person.id, chapters: [first.id, second.id] });

		expect(rows.map(row => row.id).sort()).toEqual([coach, prefs].sort());
		expect(rows.find(row => row.id === prefs)).toMatchObject({ tag: 'prefs', chapter: second.id });
	});
});