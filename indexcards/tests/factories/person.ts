import personRepo from '../../api/repos/personRepo.js';
import { faker } from '@faker-js/faker';
import factories from './index.js';
import { hashPassword } from '../../api/services/AuthService.js';

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
	if (overrides.password) {
		overrides.password = hashPassword(overrides.password);
	}
	const data = createPersonData(overrides);

	return await personRepo.createPerson(db, data);
}
export async function createJudge(overrides: Overrides & { person?: number } = {}) {
	const {Judge, Ballot: _Ballot, ...personOverrides} = overrides;
	const Person = overrides.person ? await personRepo.getPerson(db, overrides.person) : await personRepo.createPerson(db, createPersonData(personOverrides));
	if(!Person) throw new Error('Failed to create or retrieve Person');
	const judge = await factories.judge.create({ person: Person.id, ...Judge });

	return {
		Person: Person,
		Judge: judge
	};
}

//create a current ballot for a person
export async function createBallot(overrides: Overrides & { 
		person?: number,
		Round?: Partial<Parameters<typeof factories.round.create>[0]>,
		Event?: Partial<Parameters<typeof factories.event.create>[0]>,
		Timeslot?: Partial<Parameters<typeof factories.timeslot.create>[0]>,
		Ballot?: object
	} = {}) {
	const { person, Ballot, ...restOverrides } = overrides;
	const tourn =await factories.tourn.createFull(restOverrides);
	let { Person, Judge } = await factories.person.createJudge({
		person,
		Judge: { category: tourn.Category.id },
	});

	const panel = await factories.panel.create({
		round: tourn.Round.id,
	});

	const entry1 = await factories.entry.create();
	const entry2 = await factories.entry.create();
	await factories.ballot.create({
		speakerorder: 0,
		judge: Judge.id,
		entry: entry1.id,
		panel: panel.id,
		...Ballot,
	});
	await factories.ballot.create({
		speakerorder: 1,
		judge: Judge.id,
		entry: entry2.id,
		panel: panel.id,
		...Ballot,
	});
	return {
		Tourn: tourn.Tourn,
		Person,
		Judge,
	};
}

export default {
	create,
	createPersonData,
	createJudge,
	createBallot,
};
