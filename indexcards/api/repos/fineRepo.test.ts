import fineRepo from './fineRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../data/database.js';

describe('fineRepo', () => {
	describe('getFines', () => {
		it("returns the person's own fines, their judges' fines, and their schools' fines at the tourns, and nothing else", async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create({ settings: { currency: '€' } });
			const { Judge } = await factories.person.createJudge({ person: Person.id, Judge: { first: 'Jo', last: 'Judge' } });
			const mySchool = await factories.school.create({ tourn: Tourn.id, name: 'Lincoln' });
			const otherSchool = await factories.school.create({ tourn: Tourn.id });
			const elsewhere = await factories.tourn.create();

			const own = await factories.fine.create({ tourn: Tourn.id, person: Person.id, school: otherSchool.id });
			const judged = await factories.fine.create({ tourn: Tourn.id, judge: Judge.id, school: otherSchool.id });
			const billed = await factories.fine.create({ tourn: Tourn.id, school: mySchool.id, person: (await factories.person.create()).id });
			// out: another school's fine, a deleted fine of mine, and my fine at another tourn
			await factories.fine.create({ tourn: Tourn.id, school: otherSchool.id });
			await factories.fine.create({ tourn: Tourn.id, person: Person.id, school: mySchool.id, deleted: 1 });
			await factories.fine.create({ tourn: elsewhere.id, person: Person.id });

			const rows = await fineRepo.getFines(db, { person: Person.id, tourns: [Tourn.id], judges: [Judge.id], schools: [mySchool.id] });

			expect(rows.map(row => row.id).sort()).toEqual([own.id, judged.id, billed.id].sort());
			expect(rows.find(row => row.id === judged.id)).toMatchObject({
				tourn: Tourn.id,
				currency: '€',
				judge: Judge.id,
				judgeFirst: 'Jo',
				judgeLast: 'Judge',
				school: otherSchool.id,
			});
			expect(rows.find(row => row.id === billed.id)).toMatchObject({ schoolName: 'Lincoln', judge: null, judgeFirst: null });
		});

		it('returns only the own fines when no judges or schools are given', async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create();
			const School = await factories.school.create({ tourn: Tourn.id });
			const own = await factories.fine.create({ tourn: Tourn.id, person: Person.id, school: School.id });
			await factories.fine.create({ tourn: Tourn.id, school: School.id });

			const rows = await fineRepo.getFines(db, { person: Person.id, tourns: [Tourn.id] });

			expect(rows.map(row => row.id)).toEqual([own.id]);
		});
	});
});
