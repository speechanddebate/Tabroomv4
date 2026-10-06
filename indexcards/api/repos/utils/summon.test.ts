import { db } from '../../data/database.js';
import factories from '../../../tests/factories/index.js';
import { summon } from './summon.js';

describe('summon', () => {
	let tournId: number;
	const testDate = new Date('2024-03-15T12:00:00Z');

	beforeAll(async () => {
		({ id: tournId } = await factories.tourn.create());

		await db.insertInto('tourn_setting')
			.values([
				{ tourn: tournId, tag: 'test_string', value: 'womp' },
				{ tourn: tournId, tag: 'test_text', value: 'text', value_text: 'something longer' },
				{ tourn: tournId, tag: 'test_json', value: 'json', value_text: JSON.stringify({ test1: 1, test2: 'two' }) },
				{ tourn: tournId, tag: 'test_date', value: 'date', value_date: testDate },
				{ tourn: tournId, tag: 'nsda_membership', value: 'json', value_text: '{}' },
			])
			.execute();
	});

	it('returns the row with its table name', async () => {
		const tourn = await summon(db, 'tourn', tournId);
		const row = await db.selectFrom('tourn').selectAll().where('id', '=', tournId).executeTakeFirst();

		expect(tourn).toMatchObject({ ...row, table: 'tourn' });
	});

	it('decodes settings by value type and skips nsda_membership', async () => {
		const tourn = await summon(db, 'tourn', tournId);

		expect(tourn?.settings).toEqual({
			test_date   : testDate,
			test_json   : { test1: 1, test2: 'two' },
			test_string : 'womp',
			test_text   : 'something longer',
		});
	});

	it('returns an empty settings object when there are no settings', async () => {
		const { id: personId } = await factories.person.create();
		const person = await summon(db, 'person', personId);

		expect(person?.settings).toEqual({});
	});

	it('does not add settings for tables without a settings table', async () => {
		const row = await db.selectFrom('district').select('id').limit(1).executeTakeFirst();
		if (!row) {
			return;
		}
		const district = await summon(db, 'district', row.id);

		expect(district?.table).toBe('district');
		expect(district).not.toHaveProperty('settings');
	});

	it('returns undefined when no row is found', async () => {
		expect(await summon(db, 'tourn', 0)).toBeUndefined();
	});
});
