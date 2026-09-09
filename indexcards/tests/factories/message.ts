import messageRepo from '../../api/repos/messageRepo.js';
import { faker } from '@faker-js/faker';
import { db } from '../../api/data/database.js';
export function createMessageData(overrides = {}) {
	return {
		subject: faker.lorem.sentence(),
		body: faker.lorem.paragraph(),
		visible_at: faker.date.past(),
		...overrides,
	};
}

export async function create(overrides = {}) {
	const data = createMessageData({
		...overrides,
	});

	const messageId = await messageRepo.createMessage(db,data);

	return {
		messageId,
		getMessage: () => messageRepo.getMessage(db, messageId),
	};
}

export default {
	create,
	createMessageData,
};