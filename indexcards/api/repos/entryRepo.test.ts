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
			const withPerson = await factories.student.create({ first: 'Ana', last: 'Adams', person: person.id });
			const withoutPerson = await factories.student.create({ first: 'Ben', last: 'Brown' });
			const entry = await factories.entry.create({ students: [withPerson.id, withoutPerson.id] });
			await factories.entry.create({ students: [withoutPerson.id] });

			const students = await entryRepo.getEntryStudents(db, [entry.id]);

			expect(students).toHaveLength(2);
			expect(students).toEqual(expect.arrayContaining([
				{ entry: entry.id, id: withPerson.id, first: 'Ana', last: 'Adams', pronoun: 'they/them' },
				{ entry: entry.id, id: withoutPerson.id, first: 'Ben', last: 'Brown', pronoun: null },
			]));
		});
	});
});