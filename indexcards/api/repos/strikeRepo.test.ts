import strikeRepo from './strikeRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('strikeRepo', () => {
	describe('getJudgeStrikes', () => {
		it('returns the strikes the judge may see with the school name or entry code, and hides the rest', async () => {
			const { Tourn, Judge, Category, Event } = await factories.tourn.createFull().then(async (tourn) => ({
				...tourn,
				...(await factories.person.createJudge({ Judge: { category: tourn.Category.id } })),
			}));
			const School = await factories.school.create({ tourn: Tourn.id, name: 'Lincoln' });
			const Entry = await factories.entry.create({ event: Event.id, code: 'Lincoln AB' });
			const base = { judge: Judge.id, tourn: Tourn.id };
			const schoolConflict = await factories.strike.create({ ...base, type: 'school', school: School.id, conflict: 1, registrant: 1 });
			const entryConflict = await factories.strike.create({ ...base, type: 'entry', entry: Entry.id, conflict: 1, registrant: 1 });
			const departure = await factories.strike.create({ ...base, type: 'departure', start: new Date('2026-03-01T18:00:00Z'), conflict: 1, registrant: 0 });
			const unavailable = await factories.strike.create({ ...base, type: 'time', start: new Date('2026-03-01T09:00:00Z'), end: new Date('2026-03-01T11:00:00Z'), conflict: 1, registrant: 0 });
			// hidden: a school conflict tab entered (registrant 0), a school strike without the conflict flag, a tab-entered
			// unavailable time without it, and another judge's conflict
			await factories.strike.create({ ...base, type: 'school', school: School.id, conflict: 1, registrant: 0 });
			await factories.strike.create({ ...base, type: 'school', school: School.id, conflict: 0, registrant: 1 });
			await factories.strike.create({ ...base, type: 'time', start: new Date('2026-03-02T09:00:00Z'), end: new Date('2026-03-02T11:00:00Z'), conflict: 0, registrant: 0 });
			const { Judge: otherJudge } = await factories.person.createJudge({ Judge: { category: Category.id } });
			await factories.strike.create({ judge: otherJudge.id, tourn: Tourn.id, type: 'school', school: School.id, conflict: 1, registrant: 1 });

			const rows = await strikeRepo.getJudgeStrikes(db, { judges: [Judge.id] });

			expect(rows.map(row => row.id).sort()).toEqual([schoolConflict.id, entryConflict.id, departure.id, unavailable.id].sort());
			expect(rows.find(row => row.id === schoolConflict.id)).toMatchObject({ type: 'school', judge: Judge.id, school: School.id, schoolName: 'Lincoln', entry: null, entryCode: null });
			expect(rows.find(row => row.id === entryConflict.id)).toMatchObject({ type: 'entry', entry: Entry.id, entryCode: 'Lincoln AB', school: null, schoolName: null });
			expect(rows.find(row => row.id === unavailable.id)).toMatchObject({ type: 'time', start: new Date('2026-03-01T09:00:00Z'), end: new Date('2026-03-01T11:00:00Z') });
		});
	});

	describe('getStrikes', () => {
		it('returns every strike for the judges without the visibility filter', async () => {
			const { Tourn, Judge } = await factories.person.createBallot();
			const hidden = await factories.strike.create({ judge: Judge.id, tourn: Tourn.id, type: 'school', conflict: 0, registrant: 0 });

			const rows = await strikeRepo.getStrikes(db, { judges: [Judge.id] });

			expect(rows.map(row => row.id)).toEqual([hidden.id]);
		});
	});
});
