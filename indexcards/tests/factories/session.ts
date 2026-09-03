import sessionRepo from '../../api/repos/sessionRepo.js';
import type { Insertable } from 'kysely';
import type { Session, Person } from '../../api/data/schema.js';
import factories from './index.js';
import { faker } from '@faker-js/faker';
import { db } from '../../api/data/database.js';

type Overrides = Partial<Insertable<Session>> & { Person?: Partial<Insertable<Person>> };

export function createData(overrides: Overrides = {}): Insertable<Session> {
	delete overrides.Person;
	return {
		ip: faker.internet.ip(),
		...overrides,
	};
}

export async function create(overrides: Overrides = {}) {
	if(!overrides.person || overrides.Person) {
		const { personId } = await factories.person.create(overrides.Person);
		overrides.person = personId as number;
	}

	const data = createData(overrides);
	const {id: sessionId, userkey } = await sessionRepo.createSession(db,data);

	return {
		sessionId,
		personId: overrides.person,
		userkey,
		getSession: () => sessionRepo.getSession(db, sessionId),
	};
}

export default {
	create,
	createData,
};