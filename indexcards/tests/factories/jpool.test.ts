import { db } from '../../api/data/database.js';
import factories from './index.js';

describe('jpool factory', () => {
	it('creates a pool with its settings and judges', async () => {
		const { Category } = await factories.tourn.createFull();
		const { Judge } = await factories.person.createJudge({ Judge: { category: Category.id } });
		const pool = await factories.jpool.create({
			category: Category.id,
			settings: { registrant: 1, required_quizzes: [12, 34] },
			judges: [Judge.id],
		});

		expect(pool.category).toBe(Category.id);
		const members = await db.selectFrom('jpool_judge').select('judge').where('jpool', '=', pool.id).execute();
		expect(members.map((member) => member.judge)).toEqual([Judge.id]);
		const settings = await db.selectFrom('jpool_setting').select(['tag', 'value', 'value_text']).where('jpool', '=', pool.id).orderBy('tag').execute();
		expect(settings).toEqual([
			{ tag: 'registrant', value: '1', value_text: null },
			{ tag: 'required_quizzes', value: 'json', value_text: '[12,34]' },
		]);
	});
});

describe('strike factory', () => {
	it('creates a registrant conflict by default', async () => {
		const { Tourn, Judge } = await factories.person.createBallot();
		const strike = await factories.strike.create({ judge: Judge.id, tourn: Tourn.id });

		expect(strike).toMatchObject({ judge: Judge.id, tourn: Tourn.id, type: 'school', conflict: 1, registrant: 1 });
	});
});
