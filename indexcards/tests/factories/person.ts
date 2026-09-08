import personRepo from '../../api/repos/personRepo.js';
import { faker } from '@faker-js/faker';
import factories from './index.js';
import type { Person } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

type Overrides = Partial<Insertable<Person>> & { Judge?: object, Ballot?: object };

export function createPersonData(overrides: Overrides = {}) {
	// Ensure email is always unique by adding a random string
	const uniqueEmail = `user_${Math.random().toString(36).substring(2, 10)}_${Date.now()}@example.com`;
	return {
		email: uniqueEmail,
		first: faker.person.firstName(),
		middle: faker.datatype.boolean() ? faker.person.middleName() : null,
		last: faker.person.lastName(),
		state: faker.location.state({ abbreviated: true }),
		country: faker.location.countryCode(),
		tz: faker.location.timeZone(),
		...overrides,
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(overrides: Overrides & { personId?: number } = {}): Promise<{ personId: number, getPerson: any }> {
	delete overrides.Judge;
	const data = createPersonData({
		...overrides,
	});

	const personId: number = await personRepo.createPerson(data);

	return {
		personId,
		getPerson: () => personRepo.getPerson(personId, { settings: true }),
	};
}
export async function createJudge(overrides: Overrides & { personId?: number } = {}) {
	const data = createPersonData({
		...overrides,
	});
	const personId: number = overrides.personId ?? await personRepo.createPerson(data);
	const { judgeId }: { judgeId: number } = await factories.judge.createTestJudge({ person: personId, ...overrides.Judge });

	return {
		personId,
		getPerson: () => personRepo.getPerson(personId),
		judgeId,
	};
}

//create a current ballot for a person
export async function createBallot(overrides: Overrides & { 
		personId?: number,
		Round?: unknown,
		Event?: unknown,
		Timeslot?: unknown,
	} = {}) {
	let personId, judgeId;

	const tourn = await factories.tourn.createFull(overrides);
	({ personId, judgeId } = await factories.person.createJudge({
		personId: overrides.personId,
		Judge: { category: tourn.categoryId },
	}));

	const { sectionId } = await factories.section.create({
		round: tourn.roundId,
	});

	const { entryId: entry1 } = await factories.entry.createTestEntry();
	const { entryId: entry2 } = await factories.entry.createTestEntry();
	await factories.ballot.create({
		speakerorder: 0,
		judge: judgeId,
		entry: entry1,
		section: sectionId,
	});
	await factories.ballot.create({
		speakerorder: 1,
		judge: judgeId,
		entry: entry2,
		section: sectionId,
		...overrides.Ballot,
	});
	return {
		tournId: tourn.tournId,
		personId,
		judgeId,
	};
}

export default {
	create,
	createPersonData,
	createJudge,
	createBallot,
};
