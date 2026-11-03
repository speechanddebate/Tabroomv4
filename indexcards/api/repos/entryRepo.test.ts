import entryRepo from './entryRepo.js';
import { db } from '../data/database.js';
import factories from '../../tests/factories/index.js';

describe('entryRepo', () => {
	describe('getEntry', () => {
		it('should retrieve an entry by ID', async () => {
			const createdEntry = await factories.entry.create();
			const entry = await entryRepo.getEntry(db, createdEntry.id);
			expect(entry).toBeDefined();
			expect(entry?.id).toBe(createdEntry.id);
		});
		it('attaches settings correctly', async () => {
			const createdEntry = await factories.entry.create({ settings: { key: 'value' } });
			const entry = await entryRepo.getEntry(db, createdEntry.id, { settings: true });
			expect(entry).toBeDefined();
			expect(entry?.settings).toBeDefined();
			expect(entry?.settings?.key).toBe('value');
		});
	});

	describe('getEntries', () => {
		it('retrieves entries by id with the settings asked for', async () => {
			const first = await factories.entry.create({ settings: { ballot_notes: 'Needs a ramp', other: 'x' } });
			const second = await factories.entry.create();
			await factories.entry.create();

			const entries = await entryRepo.getEntries(db, { ids: [first.id, second.id], settings: ['ballot_notes'] });

			expect(entries.map(entry => entry.id).sort()).toEqual([first.id, second.id].sort());
			expect(entries.find(entry => entry.id === first.id)?.settings).toEqual({ ballot_notes: 'Needs a ramp' });
		});
	});

	describe('getEntryStudents', () => {
		it('returns each entry\'s students with their person\'s pronoun', async () => {
			const person = await factories.person.create();
			await db.updateTable('person').set({ pronoun: 'they/them' }).where('id', '=', person.id).execute();
			const withPerson = await factories.student.create({ first: 'Ana', middle: 'Q', last: 'Adams', person: person.id });
			const withoutPerson = await factories.student.create({ first: 'Ben', middle: null, last: 'Brown' });
			const entry = await factories.entry.create({ students: [withPerson.id, withoutPerson.id] });
			await factories.entry.create({ students: [withoutPerson.id] });

			const students = await entryRepo.getEntryStudents(db, [entry.id]);

			expect(students).toHaveLength(2);
			expect(students).toEqual(expect.arrayContaining([
				{ entry: entry.id, id: withPerson.id, first: 'Ana', middle: 'Q', last: 'Adams', pronoun: 'they/them' },
				{ entry: entry.id, id: withoutPerson.id, first: 'Ben', middle: null, last: 'Brown', pronoun: null },
			]));
		});
	});

	describe('getPersonEntries', () => {
		it("returns the person's entries at the given tournaments with their event and student", async () => {
			const Person = await factories.person.create();
			const Student = await factories.student.create({ person: Person.id });
			const first = await factories.tourn.createFull();
			const second = await factories.tourn.createFull();
			const other = await factories.tourn.createFull();
			const School = await factories.school.create({ tourn: first.Tourn.id });
			// entry.tourn is left null on purpose: the filter goes through the event
			const mine = await factories.entry.create({
				event: first.Event.id,
				school: School.id,
				code: 'first code',
				name: 'first name',
				students: [Student.id],
			});
			const partner = await factories.entry.create({ event: second.Event.id, students: [Student.id] });
			await factories.entry.create({ event: other.Event.id, students: [Student.id] });
			// a retired student of the person's, and another person's student, at one of the tournaments
			const Retired = await factories.student.create({ person: Person.id, retired: 1 });
			await factories.entry.create({ event: first.Event.id, students: [Retired.id] });
			const Other = await factories.student.create();
			await factories.entry.create({ event: first.Event.id, students: [Other.id] });

			const rows = await entryRepo.getPersonEntries(db, Person.id, { tourns: [first.Tourn.id, second.Tourn.id] });

			expect(rows.map(row => row.id).sort()).toEqual([mine.id, partner.id].sort());
			expect(rows.find(row => row.id === mine.id)).toMatchObject({
				code: 'first code',
				name: 'first name',
				active: 1,
				dropped: 0,
				waitlist: 0,
				unconfirmed: 0,
				school: School.id,
				event: first.Event.id,
				eventName: first.Event.name,
				eventAbbr: first.Event.abbr,
				eventType: first.Event.type,
				category: first.Category.id,
				tourn: first.Tourn.id,
				student: Student.id,
			});
		});
	});
});