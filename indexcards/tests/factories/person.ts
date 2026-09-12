import personRepo from '../../api/repos/personRepo.js';
import { faker } from '@faker-js/faker';
import factories from './index.js';

import { db } from '../../api/data/database.js';

type Overrides = Partial<Parameters<typeof personRepo.createPerson>[1]> & { Judge?: object, Ballot?: object };

export function createPersonData(overrides: Parameters<typeof personRepo.createPerson>[1] = {}): Parameters<typeof personRepo.createPerson>[1] {
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

export async function create(overrides: Overrides & { personId?: number } = {}) {
	delete overrides.Judge;
	delete overrides.Ballot;

	const data = createPersonData(overrides);


	const personId: number = await personRepo.createPerson(db, data);

	return {
		personId,
		getPerson: () => personRepo.getPerson(db, personId, { settings: true }),
	};
}
export async function createJudge(overrides: Overrides & { personId?: number } = {}) {
	const {Judge, Ballot: _Ballot, ...personOverrides} = overrides;
	const personId: number = overrides.personId ?? await personRepo.createPerson(db, createPersonData(personOverrides));
	const { judgeId }: { judgeId: number } = await factories.judge.createTestJudge({ person: personId, ...Judge });

	return {
		personId,
		getPerson: () => personRepo.getPerson(db, personId),
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
		Judge: { category: tourn.Category.id },
	}));

	const { sectionId } = await factories.section.create({
		round: tourn.roundId,
	});

	const { entryId: entry1 } = await factories.entry.create();
	const { entryId: entry2 } = await factories.entry.create();
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
