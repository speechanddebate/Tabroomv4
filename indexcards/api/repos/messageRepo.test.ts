import messageRepo from './messageRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../../api/data/database.js';

describe('messageRepo',() =>{
	describe('getMessage',() =>{
		it('returns a specific message for a specific person', async () => {
			const { personId } = await factories.person.create();
			const { messageId } = await factories.message.create({ person: personId });
			const message = await messageRepo.getMessage(db, messageId, personId);
			expect(message).not.toBeNull();
			expect(message?.id).toBe(messageId);
		});
		it('returns null for a message that does not belong to the person', async () => {
			const { personId: personId1 } = await factories.person.create();
			const { personId: personId2 } = await factories.person.create();
			const { messageId } = await factories.message.create({ person: personId1 });
			const message = await messageRepo.getMessage(db, messageId, personId2);
			expect(message).toBeUndefined();
		});
		it('returns null for a message that does not exist', async () => {
			const { personId } = await factories.person.create();
			const message = await messageRepo.getMessage(db, 9999, personId);
			expect(message).toBeUndefined();
		});
		it('returns a message when no person is specified', async () => {
			const { personId } = await factories.person.create();
			const { messageId } = await factories.message.create({ person: personId });
			const message = await messageRepo.getMessage(db, messageId);
			expect(message).not.toBeNull();
			expect(message?.id).toBe(messageId);
		});
	});
	describe('getMessages',() =>{
		it('returns all messages for a specific person', async () => {
			const { personId } = await factories.person.create();
			await factories.message.create({ person: personId });
			await factories.message.create({ person: personId });
			const messages = await messageRepo.getMessages(db, personId);
			expect(messages.length).toBe(2);
		});
	});
});
