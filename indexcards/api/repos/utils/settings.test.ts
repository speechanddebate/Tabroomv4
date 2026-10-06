
import { selectSettings, saveSettings } from './settings.js';
import { db } from '../../data/database.js';
import factories from '../../../tests/factories/index.js';
import { faker } from '@faker-js/faker';

describe('selectSettings', () => {
	let schoolId: number = 0;
	beforeAll(async () => {
		const school = await factories.school.create();
		schoolId = school.id;
		await db.insertInto('school_setting').values({ school: school.id, tag: 'foo', value: 'text', value_text: 'bar', value_date: null }).execute();
		await db.insertInto('school_setting').values({ school: school.id, tag: 'bar', value: 'value', value_text: null, value_date: null }).execute();
	});
	it('generates a valid snippet for all settings', async () => {
		const sqlSnippet = selectSettings({
			table: 'school',
			settings: true,
		});
		expect(sqlSnippet).toBeDefined();
		const res = await db.selectFrom('school').where('id', '=', schoolId).select(sqlSnippet).executeTakeFirst();

		expect(res).toBeDefined();
		expect(res?.settings).toBeDefined();
		expect(Object.keys(res?.settings || {})).toEqual(expect.arrayContaining(['foo', 'bar']));
	});
	it('selects specific settings correctly', async () => {
		const sqlSnippet = selectSettings({
			table: 'school',
			settings: ['foo'],
		});
		expect(sqlSnippet).toBeDefined();
		const res = await db.selectFrom('school').where('id', '=', schoolId).select(sqlSnippet).executeTakeFirst();

		expect(res).toBeDefined();
		expect(res?.settings).toBeDefined();
		expect(Object.keys(res?.settings || {})).toEqual(expect.arrayContaining(['foo']));
	});
	it('handles as override correctly', async () => {
		const sqlSnippet = selectSettings({
			table: 'school',
			settings: ['foo'],
			as: 'custom_settings',
		});
		expect(sqlSnippet).toBeDefined();
		const res = await db.selectFrom('school').where('id', '=', schoolId).select(sqlSnippet).executeTakeFirst();

		expect(res).toBeDefined();
		expect('settings' in res!).toBe(false);
		expect(res!.custom_settings).toBeDefined();
		expect(Object.keys(res?.custom_settings || {})).toEqual(expect.arrayContaining(['foo']));
	});
	it('handles table alias override correctly', async () => {
		const sqlSnippet = selectSettings({
			table: 'school',
			tableAs: 's',
			settings: ['foo'],
		});
		expect(sqlSnippet).toBeDefined();
		const res = await db.selectFrom('school as s').where('id', '=', schoolId).select(sqlSnippet).executeTakeFirst();

		expect(res).toBeDefined();
		expect(res?.settings).toBeDefined();
		expect(Object.keys(res?.settings || {})).toEqual(expect.arrayContaining(['foo']));
	});
});
describe('saveSettings', () => {
	let catId = 1;
	beforeAll(async () => {
		const category = await factories.category.create();
		catId = category.id;
	});
	it('saves settings correctly', async () => {
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: 'bar', bar: 'baz' },
			ownerId: catId,
		});
		const res = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(res?.settings).toBeDefined();
		expect(res?.settings?.foo).toBe('bar');
		expect(res?.settings?.bar).toBe('baz');
	});
	it('can save the various value types correctly', async () => {
		// Save a boolean
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: true, bar: false },
			ownerId: catId,
		});
		const resBool = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(resBool?.settings).toBeDefined();
		expect(resBool?.settings?.foo).toBe('1');
		expect(resBool?.settings?.bar).toBe('0');
		// Save a number
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: 42 },
			ownerId: catId,
		});
		const resNum = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(resNum?.settings).toBeDefined();
		expect(resNum?.settings?.foo).toBe('42');
		// Save a Date value
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: new Date('2023-01-01T00:00:00Z') },
			ownerId: catId,
		});
		const res = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(res?.settings).toBeDefined();
		expect(new Date(res!.settings!.foo)).toEqual(new Date('2023-01-01T00:00:00Z'));
		// Save an object
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: { bar: 'baz' } },
			ownerId: catId,
		});
		const resObj = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(resObj?.settings).toBeDefined();
		expect(resObj?.settings?.foo).toBe('{"bar": "baz"}');
		// save a long string
		const longString = faker.lorem.paragraphs(5);
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: longString },
			ownerId: catId,
		});
		const resLong = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(resLong?.settings).toBeDefined();
		expect(resLong?.settings?.foo).toBe(longString);
	});
	it('deletes the row when the setting is set to null', async () => {
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: 'value' },
			ownerId: catId,
		});
		const og = await db.selectFrom('category')
			.where('id', '=', catId)
			.select(selectSettings({ table: 'category', settings: true }))
			.executeTakeFirst();
		expect(og?.settings).toBeDefined();
		expect(og?.settings?.foo).toBe('value');
		await saveSettings({
			db,
			table: 'category',
			settings: { foo: null },
			ownerId: catId,
		});
		const res = await db.selectFrom('category_setting')
			.where('category', '=', catId)
			.where('tag', '=', 'foo')
			.selectAll()
			.executeTakeFirst();
		expect(res).toBeUndefined();
	});
});