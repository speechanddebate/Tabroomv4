import jpoolRepo from './jpoolRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('jpoolRepo', () => {
	describe('getJudgePools', () => {
		it('returns one row per pool and judge for the given judges, with the settings asked for', async () => {
			const { Category } = await factories.tourn.createFull();
			const { Judge: first } = await factories.person.createJudge({ Judge: { category: Category.id } });
			const { Judge: second } = await factories.person.createJudge({ Judge: { category: Category.id } });
			const { Judge: other } = await factories.person.createJudge({ Judge: { category: Category.id } });
			const shared = await factories.jpool.create({ category: Category.id, judges: [first.id, second.id, other.id], settings: { registrant: 1, required_quizzes: [7] } });
			const standby = await factories.jpool.create({ category: Category.id, judges: [first.id], settings: { standby: 1 } });
			await factories.jpool.create({ category: Category.id, judges: [other.id] });

			const rows = await jpoolRepo.getJudgePools(db, { judges: [first.id, second.id], settings: ['registrant', 'standby', 'required_quizzes'] });

			expect(rows.map(row => [row.id, row.judge]).sort()).toEqual([
				[shared.id, first.id],
				[shared.id, second.id],
				[standby.id, first.id],
			].sort());
			// selectSettings returns json settings as their text, like the other repos
			expect(rows.find(row => row.id === shared.id)).toMatchObject({
				name: shared.name,
				category: Category.id,
				settings: { registrant: '1', required_quizzes: '[7]' },
			});
			expect(rows.find(row => row.id === standby.id)?.settings).toEqual({ standby: '1' });
		});
	});

	describe('getJpools', () => {
		it('filters by ids, category, and judges', async () => {
			const { Category } = await factories.tourn.createFull();
			const { Judge } = await factories.person.createJudge({ Judge: { category: Category.id } });
			const mine = await factories.jpool.create({ category: Category.id, judges: [Judge.id] });
			const empty = await factories.jpool.create({ category: Category.id });

			expect((await jpoolRepo.getJpools(db, { category: Category.id })).map(pool => pool.id).sort()).toEqual([mine.id, empty.id].sort());
			expect((await jpoolRepo.getJpools(db, { judges: [Judge.id] })).map(pool => pool.id)).toEqual([mine.id]);
			expect((await jpoolRepo.getJpools(db, { ids: [empty.id] })).map(pool => pool.id)).toEqual([empty.id]);
			expect(await jpoolRepo.getJpool(db, mine.id)).toMatchObject({ id: mine.id, name: mine.name });
		});
	});
});
