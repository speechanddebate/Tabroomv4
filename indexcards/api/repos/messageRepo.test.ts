import messageRepo from './messageRepo.js';
import factories from '../../tests/factories/index.js';
import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';

describe('messageRepo',() => {
	describe('buildMessageQuery',() => {
		it('does not return deleted messages when excludeDeleted is true', async () => {
			const Person = await factories.person.create();
			const deletedMessage = await factories.message.create({ person: Person.id, deleted_at: faker.date.past() });
			const messages = await messageRepo.getMessages(db, Person.id, { excludeDeleted: true });
			expect(messages.every(message => !message.deleted_at)).toBe(true);
			expect(messages).not.toContainEqual(expect.objectContaining({ id: deletedMessage.id }));
		});
		it('does not return invisible messages when excludeInvisible is true', async () => {
			const Person = await factories.person.create();
			const invisibleMessage = await factories.message.create({ person: Person.id, visible_at: faker.date.soon() });
			const visibleMessage = await factories.message.create({ person: Person.id, visible_at: faker.date.recent() });
			const messages = await messageRepo.getMessages(db, Person.id, { excludeInvisible: true });
			expect(messages).not.toContainEqual(expect.objectContaining({ id: invisibleMessage.id }));
			expect(messages).toContainEqual(expect.objectContaining({ id: visibleMessage.id }));
		});
		it('only returns unread messages when excludeRead is true', async () => {
			const Person = await factories.person.create();
			const unreadMessage = await factories.message.create({ person: Person.id, read_at: null });
			const readMessage = await factories.message.create({ person: Person.id, read_at: faker.date.past() });
			const messages = await messageRepo.getMessages(db, Person.id, { unread: true });
			expect(messages).toContainEqual(expect.objectContaining({ id: unreadMessage.id }));
			expect(messages).not.toContainEqual(expect.objectContaining({ id: readMessage.id }));
		});
	});
	describe('getMessage',() =>{
		it('returns a specific message for a specific person', async () => {
			const Person = await factories.person.create();
			const Message = await factories.message.create({ person: Person.id });
			const message = await messageRepo.getMessage(db, Message.id, Person.id);
			expect(message).not.toBeNull();
			expect(message?.id).toBe(Message.id);
		});
		it('attaches Tourn, Sender, and Email data', async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create();
			const Sender = await factories.person.create();
			const Email = await factories.email.create();
			const Message = await factories.message.create({ person: Person.id, tourn: Tourn.id, sender: Sender.id, email: Email.id });
			const message = await messageRepo.getMessage(db, Message.id, Person.id);
			expect(message).not.toBeNull();
			expect(message?.Tourn?.id).toBe(Tourn.id);
			expect(message?.Sender?.email).toBe(Sender.email);
			expect(message?.Email?.content).toBe(Email.content);
		});
		it('returns null for a message that does not belong to the person', async () => {
			const Person1 = await factories.person.create();
			const Person2 = await factories.person.create();
			const Message = await factories.message.create({ person: Person1.id });
			const message = await messageRepo.getMessage(db, Message.id, Person2.id);
			expect(message).toBeUndefined();
		});
		it('returns null for a message that does not exist', async () => {
			const Person = await factories.person.create();
			const message = await messageRepo.getMessage(db, 9999, Person.id);
			expect(message).toBeUndefined();
		});
		it('returns a message when no person is specified', async () => {
			const Person = await factories.person.create();
			const Message = await factories.message.create({ person: Person.id });
			const message = await messageRepo.getMessage(db, Message.id);
			expect(message).not.toBeNull();
			expect(message?.id).toBe(Message.id);
		});
	});
	describe('getMessages',() =>{
		it('returns all messages for a specific person', async () => {
			const Person = await factories.person.create();
			await factories.message.create({ person: Person.id });
			await factories.message.create({ person: Person.id });
			const messages = await messageRepo.getMessages(db, Person.id);
			expect(messages.length).toBe(2);
		});
		it('attaches Tourn, Sender, and Email data', async () => {
			const Person = await factories.person.create();
			const Tourn = await factories.tourn.create();
			const Sender = await factories.person.create();
			const Email = await factories.email.create();
			await factories.message.create({ person: Person.id, tourn: Tourn.id, sender: Sender.id, email: Email.id });
			const message = await messageRepo.getMessages(db, Person.id);
			expect(message.length).toBeGreaterThan(0);
			expect(message[0]?.Tourn?.id).toBe(Tourn.id);
			expect(message[0]?.Sender?.email).toBe(Sender.email);
			expect(message[0]?.Email?.content).toBe(Email.content);
		});
	});
	describe('recordDelivery', () => {
		const delivery = (id: number) => db.selectFrom('message')
			.select(['email_status', 'emailed_at', 'push_status', 'pushed_at'])
			.where('id', '=', id)
			.executeTakeFirstOrThrow();

		it('records how a queued delivery ended and when', async () => {
			const Message = await factories.message.create({ email_status: 'queued', push_status: 'queued' });

			await expect(messageRepo.recordDelivery(db, Message.id, 'email', 'sent')).resolves.toBe(true);

			const row = await delivery(Message.id);
			expect(row.email_status).toBe('sent');
			expect(row.emailed_at).toBeInstanceOf(Date);
			// The other channel is its own record
			expect(row).toMatchObject({ push_status: 'queued', pushed_at: null });

			await messageRepo.recordDelivery(db, Message.id, 'push', 'rejected');
			expect(await delivery(Message.id)).toMatchObject({ email_status: 'sent', push_status: 'rejected', pushed_at: expect.any(Date) });
		});
		it('records a delivery queued before the status was kept', async () => {
			const Message = await factories.message.create();

			await expect(messageRepo.recordDelivery(db, Message.id, 'push', 'sent')).resolves.toBe(true);
			expect((await delivery(Message.id)).push_status).toBe('sent');
		});
		it('leaves a delivery that already ended alone', async () => {
			const sentAt = new Date('2026-10-01T12:00:00Z');
			const Message = await factories.message.create({ email_status: 'sent', emailed_at: sentAt });

			await expect(messageRepo.recordDelivery(db, Message.id, 'email', 'failed')).resolves.toBe(false);
			expect(await delivery(Message.id)).toMatchObject({ email_status: 'sent', emailed_at: sentAt });
		});
	});
});
