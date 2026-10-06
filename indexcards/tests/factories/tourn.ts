import { faker } from '@faker-js/faker';
import { fakeTournName, toWebName, noMs } from './factoryUtils.js';
import tournRepo from '../../api/repos/tournRepo.js';
import { db } from '../../api/data/database.js';
import factories from './index.js';
import type { Tourn, Event, Timeslot } from '../../api/data/schema.js';
import type { Settings } from '../../api/repos/utils/settings.js';
import type { Insertable } from 'kysely';

export function createTournData(overrides: Partial<Insertable<Tourn>> & { settings?: Settings } = {}) {
	const name = overrides.name ?? fakeTournName();
	const country = overrides.country ?? 'US';
	return {
		name: name,
		country: country,
		city: faker.location.city(),
		state: (country === 'US' ? faker.location.state({ abbreviated: true }): null),
		tz: (country === 'US' ? faker.helpers.arrayElement([
			'America/New_York',
			'America/Chicago',
			'America/Denver',
			'America/Los_Angeles',
		])
				: 'UTC'),
		webname: toWebName(name),
		hidden: 0,
		start: noMs(faker.date.recent()),
		end: noMs(faker.date.future()),
		reg_start: noMs(faker.date.recent()),
		reg_end: noMs(faker.date.future()),
		...overrides,
	};
}

export async function create(overrides: Partial<Insertable<Tourn>> & { circuit?: number, settings?: Settings } = {}) {
	const { circuit, settings, ...tournOverrides } = overrides;
	const data = createTournData({ ...tournOverrides, settings });
	const tourn = await tournRepo.createTourn(db, data);

	if(circuit) {
		await db.insertInto('tourn_circuit')
		.values({ tourn: tourn.id, circuit: circuit, approved: 1 })
		.execute();
	}

	return tourn;
}

type FullTournOverrides = Partial<Insertable<Tourn>> & {
	Event?: Partial<Insertable<Event>>;
	Timeslot?: Partial<Insertable<Timeslot>>;
	Round?: Parameters<typeof factories.round.create>[0];
};
//create a full test tourn with category, event and the like
export async function createFull(overrides: FullTournOverrides = {}){
	const { Event, Timeslot, Round, ...tournOverrides } = overrides;
	const data = createTournData(tournOverrides);
	const tourn = await tournRepo.createTourn(db, data);
	const Category = await factories.category.create({ tourn: tourn.id });
	const CreatedEvent = await factories.event.create({ tourn: tourn.id, ...Event, category: Category.id });
	const CreatedTimeslot = await factories.timeslot.create({ tourn: tourn.id, ...Timeslot });
	const CreatedRound = await factories.round.create({
		event: CreatedEvent.id,
		timeslot: CreatedTimeslot.id,
		...Round,
		settings: {
			judges_ballots_visible: 1,
			...Round?.settings,
		},
	});
	return {
		Tourn: tourn,
		Category,
		Event: CreatedEvent,
		Timeslot: CreatedTimeslot,
		Round: CreatedRound
	};
};
export default {
	createTournData,
	create,
	createFull,
};
