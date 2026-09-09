import { faker } from '@faker-js/faker';
import webpageRepo from '../../api/repos/webpageRepo.js';
import { db } from '../../api/data/database.js';
import type { Webpage } from '../../api/data/schema.js';
import type { Insertable } from 'kysely';

export function createWebpageData(overrides = {}): Insertable<Webpage> {
	return {
		title: faker.lorem.sentence().slice(0, 63),
		content: faker.lorem.paragraphs(),
		sidebar: faker.lorem.paragraph(),
		slug: faker.lorem.slug(),
		published: 1,
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createWebpageData(overrides);

	const webpageId = await webpageRepo.createWebpage(db, data);

	return {
		webpageId,
		getWebpage: () => webpageRepo.getWebpage(db, webpageId),
	};
}

export default {
	createWebpageData,
	create,
};
