
import factories from '../../tests/factories/index.js';
import personRepo from './personRepo.js';
import db2 from '../data/db.js';

import { db } from '../data/database.js';

//kinda hate this but it allows us to test the paradigm cutoff logic without having to mock out the entire settings system or
// manipulate time in a way that could affect other tests. will eventually want to setup more robust settings testing
async function setTabroomDateSetting(tag: string, valueDate: Date) {
	const [setting] = await db2.tabroomSetting.findOrCreate({
		where: { tag },
		defaults: {
			tag,
			value: 'date',
			value_date: valueDate,
		},
	});

	await setting.update({
		value: 'date',
		value_date: valueDate,
	});
}

async function getTabroomDateSettingSnapshot(tag: string) {
	const row = await db2.tabroomSetting.findOne({ where: { tag } });
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
		await db2.tabroomSetting.destroy({ where: { tag } });
		return;
	}

	await db2.tabroomSetting.update(
		{
			value: snapshot.value,
			value_text: snapshot.value_text,
			value_date: snapshot.value_date,
			person: snapshot.person,
		},
		{ where: { id: snapshot.id } }
	);
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

			const { personId } = await factories.person.create({
				settings: {
					paradigm: 'Legacy paradigm text',
				},
			});

			const staleTimestamp = new Date(reviewStart.getTime() - 24 * 60 * 60 * 1000);
			await db.updateTable('person_setting')
				.set({ timestamp: staleTimestamp })
				.where('person', '=', personId)
				.where('tag','=', 'paradigm')
				.execute();

			const person = await personRepo.getPerson(db, personId, { hasValidParadigm: true });

			expect(person).toBeDefined();
			expect(person?.id).toBe(personId);
		});

		it('excludes paradigm older than review start once cutoff is active', async () => {
			const now = new Date();
			const reviewStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const cutoffInPast = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			await setTabroomDateSetting('paradigm_review_start', reviewStart);
			await setTabroomDateSetting('paradigm_review_cutoff', cutoffInPast);

			const { personId } = await factories.person.create({
				settings: {
					paradigm: 'Stale paradigm text',
				},
			});

			const staleTimestamp = new Date(reviewStart.getTime() - 24 * 60 * 60 * 1000);
			await db.updateTable('person_setting')
				.set({ timestamp: staleTimestamp })
				.where('person', '=', personId)
				.where('tag','=', 'paradigm')
				.execute();

			const person = await personRepo.getPerson(db, personId, { hasValidParadigm: true });

			expect(person).toBeUndefined();
		});

		it('includes paradigm newer than review start once cutoff is active', async () => {
			const now = new Date();
			const reviewStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const cutoffInPast = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			await setTabroomDateSetting('paradigm_review_start', reviewStart);
			await setTabroomDateSetting('paradigm_review_cutoff', cutoffInPast);

			const { personId } = await factories.person.create({
				settings: {
					paradigm: 'Fresh paradigm text',
				},
			});

			const freshTimestamp = new Date(now.getTime() - 60 * 1000);
			await db.updateTable('person_setting')
				.set({ timestamp: freshTimestamp })
				.where('person', '=', personId)
				.where('tag','=', 'paradigm')
				.execute();

			const person = await personRepo.getPerson(db, personId, { hasValidParadigm: true });

			expect(person).toBeDefined();
			expect(person?.id).toBe(personId);
		});
	});

	describe('buildPersonQuery', () => {
		it('excludes banned persons when excludeBanned is true', async () => {
			// Arrange
			const { personId } = await factories.person.create({
				settings: {
					banned: '1',
				},
			});

			// Act
			const person = await personRepo.getPerson(db, personId, { excludeBanned: true });

			// Assert
			expect(person).toBeUndefined();
		});

		it('excludes persons with unconfirmed emails when excludeUnconfirmedEmail is true', async () => {
			// Arrange
			const { personId } = await factories.person.create({
				settings: {
					email_unconfirmed: '1',
				},
			});
			// Act
			const person = await personRepo.getPerson(db,personId, { excludeUnconfirmedEmail: true });

			// Assert
			expect(person).toBeUndefined();
		});
		describe('filters by hasValidParadigm', () => {
			it('excludes persons without a paradigm setting', async () => {
				// Arrange
				const { personId } = await factories.person.create();
				// Act
				const person = await personRepo.getPerson(db,personId, { hasValidParadigm: true });
				// Assert
				expect(person).toBeUndefined();
			});
		});
	});

	describe('getPerson', () => {
		it('returns the person when the id is valid', async () => {
			// Arrange
			const { personId } = await factories.person.create();
			// Act
			const result = await personRepo.getPerson(db, personId);
			// Assert
			expect(result).not.toBeNull();
			expect(result?.id).toBe(personId);
		});
		it('returns undefined when the id is invalid', async () => {
			// Act
			const result = await personRepo.getPerson(db, 999999);
			// Assert
			expect(result).toBeUndefined();
		});
	});

	describe('personSearch', () => {
		it('returns persons matching the search query', async () => {
			// Arrange
			const personData = factories.person.createPersonData();
			const { personId } = await factories.person.create(personData);
			//person must have judged at least once to be included in search results
			await factories.judge.createTestJudge({ person: personId });

			// Act
			const results = await personRepo.personSearch(db, `${personData.first} ${personData.last}`);

			// Assert: expect the search results to include the created person
			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBeGreaterThan(0);
			expect(results[0].id).toBe(personId);
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
			const { personId, getPerson } = await factories.person.create();
			const person = await getPerson();

			// Act
			const result = await personRepo.getPersonByUsername(db,person?.email ?? '');

			// Assert
			expect(result).not.toBeNull();
			expect(result?.id).toBe(personId);
		});
	});

	describe('createPerson', () => {
		it('creates a person and returns the new id', async () => {
			// Arrange
			const personData = factories.person.createPersonData();
			// Act
			const newPersonId = await personRepo.createPerson(db, personData);
			// Assert
			expect(newPersonId).toBeDefined();
			const person = await personRepo.getPerson(db, newPersonId);
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
			const newPersonId = await personRepo.createPerson(db, personData);
			// Assert
			expect(newPersonId).toBeDefined();
			const person = await personRepo.getPerson(db, newPersonId, { settings: true });
			expect(person).not.toBeNull();
			expect(person?.settings.paradigm).toBe('Test paradigm');
		});
	});

	describe('updatePerson', () => {
		it('saves person settings for an existing person', async () => {
			const { personId } = await factories.person.create();
			const now = new Date();

			await personRepo.updatePerson(db, personId, {
				settings: {
					student_search_count: 3,
					last_student_search: now,
				}
			});

			const updated = await personRepo.getPerson(db, personId, {
				settings: true,
			});

			expect(updated?.settings.student_search_count).toBe(3);
			expect(updated?.settings.last_student_search).toEqualDate(now);
		});

		it('updates existing person settings on subsequent saves', async () => {
			const { personId } = await factories.person.create();
			const firstDate = new Date(Date.now() - 60 * 60 * 1000);
			const secondDate = new Date();

			
			await personRepo.updatePerson(db, personId, {
				settings: {
					student_search_count: 1,
					last_student_search: firstDate,
				}
			});

			await personRepo.updatePerson(db, personId, {
				settings: {
					student_search_count: 7,
					last_student_search: secondDate,
				}
			});

			const updated = await personRepo.getPerson(db, personId, {
				settings: true,
			});

			expect(updated?.settings.student_search_count).toBe(7);
			expect(updated?.settings.last_student_search).toEqualDate(secondDate);
		});
	});
});
