
import factories from '../../tests/factories/index.js';
import personRepo from './personRepo.js';

import { db } from '../data/database.js';

//kinda hate this but it allows us to test the paradigm cutoff logic without having to mock out the entire settings system or
// manipulate time in a way that could affect other tests. will eventually want to setup more robust settings testing
async function setTabroomDateSetting(tag: string, valueDate: Date) {
	const row = await db.selectFrom('tabroom_setting').where('tag', '=', tag).selectAll().executeTakeFirst();
	if (!row) {
		await db.insertInto('tabroom_setting')
			.values({
				tag,
				value: 'date',
				value_date: valueDate,
			})
			.execute();
	}
	const setting = await db.selectFrom('tabroom_setting').where('tag', '=', tag).selectAll().executeTakeFirst();

	await db.updateTable('tabroom_setting')
		.set({
			value: 'date',
			value_date: valueDate,
		})
		.where('id', '=', setting!.id)
		.execute();
}

async function getTabroomDateSettingSnapshot(tag: string) {
	const row = await db.selectFrom('tabroom_setting').where('tag', '=', tag).selectAll().executeTakeFirst();
	if (!row) return null;

	return {
		id: row.id,
		tag: row.tag,
		value: row.value,
		value_text: row.value_text,
		value_date: row.value_date,
		person: row.person,
	};
}

async function restoreTabroomDateSetting(tag: string, snapshot: Awaited<ReturnType<typeof getTabroomDateSettingSnapshot>>) {
	if (!snapshot) {
		// If no snapshot exists, delete the setting
		await db.deleteFrom('tabroom_setting').where('tag', '=', tag).execute();
		return;
	}

	await db.updateTable('tabroom_setting')
		.set({
			value: snapshot.value,
			value_text: snapshot.value_text,
			value_date: snapshot.value_date,
			person: snapshot.person,
		})
		.where('id', '=', snapshot.id)
		.execute();
}

describe('PersonRepo', () => {
	describe('hasValidParadigm with auto cutoff discovery', () => {
		let cutoffSnapshot: Awaited<ReturnType<typeof getTabroomDateSettingSnapshot>>;
		let startSnapshot: Awaited<ReturnType<typeof getTabroomDateSettingSnapshot>>;

		beforeEach(async () => {
			cutoffSnapshot = await getTabroomDateSettingSnapshot('paradigm_review_cutoff');
			startSnapshot = await getTabroomDateSettingSnapshot('paradigm_review_start');
		});

		afterEach(async () => {
			await restoreTabroomDateSetting('paradigm_review_cutoff', cutoffSnapshot);
			await restoreTabroomDateSetting('paradigm_review_start', startSnapshot);
		});

		it('includes paradigm when cutoff is not active yet', async () => {
			const now = new Date();
			const reviewStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const cutoffInFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);

			await setTabroomDateSetting('paradigm_review_start', reviewStart);
			await setTabroomDateSetting('paradigm_review_cutoff', cutoffInFuture);

			const Person = await factories.person.create({
				settings: {
					paradigm: 'Legacy paradigm text',
				},
			});

			const staleTimestamp = new Date(reviewStart.getTime() - 24 * 60 * 60 * 1000);
			await db.updateTable('person_setting')
				.set({ timestamp: staleTimestamp })
				.where('person', '=', Person.id)
				.where('tag','=', 'paradigm')
				.execute();

			const person = await personRepo.getPerson(db, Person.id, { hasValidParadigm: true });

			expect(person).toBeDefined();
			expect(person?.id).toBe(Person.id);
		});

		it('excludes paradigm older than review start once cutoff is active', async () => {
			const now = new Date();
			const reviewStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const cutoffInPast = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			await setTabroomDateSetting('paradigm_review_start', reviewStart);
			await setTabroomDateSetting('paradigm_review_cutoff', cutoffInPast);

			const Person = await factories.person.create({
				settings: {
					paradigm: 'Stale paradigm text',
				},
			});

			const staleTimestamp = new Date(reviewStart.getTime() - 24 * 60 * 60 * 1000);
			await db.updateTable('person_setting')
				.set({ timestamp: staleTimestamp })
				.where('person', '=', Person.id)
				.where('tag','=', 'paradigm')
				.execute();

			const person = await personRepo.getPerson(db, Person.id, { hasValidParadigm: true });

			expect(person).toBeUndefined();
		});

		it('includes paradigm newer than review start once cutoff is active', async () => {
			const now = new Date();
			const reviewStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const cutoffInPast = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			await setTabroomDateSetting('paradigm_review_start', reviewStart);
			await setTabroomDateSetting('paradigm_review_cutoff', cutoffInPast);

			const Person = await factories.person.create({
				settings: {
					paradigm: 'Fresh paradigm text',
				},
			});

			const freshTimestamp = new Date(now.getTime() - 60 * 1000);
			await db.updateTable('person_setting')
				.set({ timestamp: freshTimestamp })
				.where('person', '=', Person.id)
				.where('tag','=', 'paradigm')
				.execute();

			const person = await personRepo.getPerson(db, Person.id, { hasValidParadigm: true });

			expect(person).toBeDefined();
			expect(person?.id).toBe(Person.id);
		});
	});

	describe('buildPersonQuery', () => {
		it('excludes banned persons when excludeBanned is true', async () => {
			// Arrange
			const Person = await factories.person.create({
				settings: {
					banned: '1',
				},
			});

			// Act
			const person = await personRepo.getPerson(db, Person.id, { excludeBanned: true });

			// Assert
			expect(person).toBeUndefined();
		});

		it('excludes persons with unconfirmed emails when excludeUnconfirmedEmail is true', async () => {
			// Arrange
			const Person = await factories.person.create({
				settings: {
					email_unconfirmed: '1',
				},
			});
			// Act
			const person = await personRepo.getPerson(db, Person.id, { excludeUnconfirmedEmail: true });

			// Assert
			expect(person).toBeUndefined();
		});
		describe('filters by hasValidParadigm', () => {
			it('excludes persons without a paradigm setting', async () => {
				// Arrange
				const Person = await factories.person.create();
				// Act
				const person = await personRepo.getPerson(db, Person.id	, { hasValidParadigm: true });
				// Assert
				expect(person).toBeUndefined();
			});
		});
	});

	describe('getPerson', () => {
		it('returns the person when the id is valid', async () => {
			// Arrange
			const Person = await factories.person.create();
			// Act
			const result = await personRepo.getPerson(db, Person.id);
			// Assert
			expect(result).not.toBeNull();
			expect(result?.id).toBe(Person.id);
		});
	});

	describe('personSearch', () => {
		it('returns persons matching the search query', async () => {
			// Arrange
			const personData = factories.person.createPersonData();
			const Person = await factories.person.create(personData);
			//person must have judged at least once to be included in search results
			await factories.judge.create({ person: Person.id });

			// Act
			const results = await personRepo.personSearch(db, `${personData.first} ${personData.last}`);

			// Assert: expect the search results to include the created person
			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].id).toBe(Person.id);
		});
		it('returns an empty array when no persons match the search query', async () => {
			// Arrange
			const personData = factories.person.createPersonData();
			await factories.person.create(personData);

			// Act
			const results = await personRepo.personSearch(db,'Nonexistent Name');

			// Assert
			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBe(0);
		});
		it('returns results when search query is empty', async () => {
			// Arrange
			const personData = factories.person.createPersonData();
			await factories.person.create(personData);

			// Act
			const results = await personRepo.personSearch(db,'');

			// Assert
			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBeGreaterThan(0);
		});
	});

	describe('getPersonByUsername', () => {
		it('returns the person when the username is valid', async () => {
			// Arrange
			const Person = await factories.person.create();

			// Act
			const result = await personRepo.getPersonByUsername(db,Person?.email ?? '');

			// Assert
			expect(result).not.toBeNull();
			expect(result?.id).toBe(Person.id);
		});
	});

	describe('createPerson', () => {
		it('creates a person and returns the new id', async () => {
			// Arrange
			const personData = factories.person.createPersonData();
			// Act
			const newPerson = await personRepo.createPerson(db, personData);
			// Assert
			expect(newPerson).toBeDefined();
			const person = await personRepo.getPerson(db, newPerson.id);
			expect(person).not.toBeNull()
			expect(person?.first).toBe(personData.first);
		});
		it('creates a person with settings', async () => {
			// Arrange
			const personData = factories.person.createPersonData({
				settings: {
					paradigm: 'Test paradigm',
				},
			});
			// Act
			const newPerson = await personRepo.createPerson(db, personData);
			// Assert
			expect(newPerson).toBeDefined();
			const person = await personRepo.getPerson(db, newPerson.id, { settings: true });
			expect(person).not.toBeUndefined();
			expect(person?.settings!.paradigm).toBe('Test paradigm');
		});
	});

	describe('updatePerson', () => {
		it('updates a person row with new data', async () => {
			const Person = await factories.person.create();
			const updates = { first: 'UpdatedFirstName' };

			await personRepo.updatePerson(db, Person.id, updates);

			const updated = await personRepo.getPerson(db, Person.id);
			expect(updated?.first).toBe(updates.first);
		});
		it('saves person settings for an existing person', async () => {
			const Person = await factories.person.create();
			const now = new Date();

			await personRepo.updatePerson(db, Person.id, {
				settings: {
					student_search_count: 3,
					last_student_search: now,
				}
			});

			const updated = await personRepo.getPerson(db, Person.id, {
				settings: true,
			});

			expect(Number(updated!.settings!.student_search_count)).toBe(3);
			expect(updated!.settings!.last_student_search).toEqualDate(now);
		});

		it('updates existing person settings on subsequent saves', async () => {
			const Person = await factories.person.create();
			const firstDate = new Date(Date.now() - 60 * 60 * 1000);
			const secondDate = new Date();

			
			await personRepo.updatePerson(db, Person.id, {
				settings: {
					student_search_count: 1,
					last_student_search: firstDate,
				}
			});

			await personRepo.updatePerson(db, Person.id, {
				settings: {
					student_search_count: 7,
					last_student_search: secondDate,
				}
			});

			const updated = await personRepo.getPerson(db, Person.id, {
				settings: true,
			});

			expect(Number(updated?.settings!.student_search_count)).toBe(7);
			expect(updated?.settings!.last_student_search).toEqualDate(secondDate);
		});
	});
});
