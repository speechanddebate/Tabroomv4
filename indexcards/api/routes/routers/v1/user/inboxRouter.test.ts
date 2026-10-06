
import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import z from 'zod';
import { InboxMessageSchema, InboxUnreadCountSchema } from '@tabroom/types';
import messageRepo from '../../../../repos/messageRepo.js';
import { db } from '../../../../data/database.js';
import { faker } from '@faker-js/faker';

describe('Inbox Router', () => {
	let personId : number;
	let userkey: string;
	let nonExistentId: number;
	beforeAll(async () => {
		({ id: personId } = await factories.person.create());
		await factories.message.create({ person: personId });
		({ userkey } = await factories.session.create({ person: personId }));
		({ id: nonExistentId } = await factories.message.create({ person: personId }));
		await db.deleteFrom('message').where('id', '=', nonExistentId).execute();

	});

	describe('GET /user/inbox', () => {
		it('Returns the list of messages for the user', async () => {

			const res = await request(server)
				.get('/v1/user/inbox')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res).not.toBeProblemResponse();
			expect(res.body).toMatchSchema(z.array(InboxMessageSchema));
			expect(res.body.length).toBe(1);
		});
		it('does not return deleted or non visible messages', async () => {
			const DeletedMessage = await factories.message.create({
				person: personId,
				deleted_at: faker.date.recent(),
			})
			const InvisibleMessage = await factories.message.create({
				person: personId,
				visible_at: faker.date.soon(),
			})
			const res = await request(server)
				.get('/v1/user/inbox')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect('Content-Type', /json/)
				.expect(200);

			expect(res).not.toBeProblemResponse();
			expect(res.body).toMatchSchema(z.array(InboxMessageSchema));
			const messages = z.array(InboxMessageSchema).parse(res.body);

			expect(messages.some(message => message.id === DeletedMessage.id)).toBe(false);
			expect(messages.some(message => message.id === InvisibleMessage.id)).toBe(false);
		});
	});
	describe('GET /user/inbox/unread', () => {
		it('Returns the number of unread messages', async () => {
			const Person1 = await factories.person.create();
			await factories.message.create({ person: Person1.id });
			const { userkey: key1 } = await factories.session.create({ person: Person1.id });

			const res = await request(server)
				.get('/v1/user/inbox/unread')
				.set('Accept', 'application/json')
				.asPerson(key1)
				.expect('Content-Type', /json/)
				.expect(200);
			expect(res.body).toMatchSchema(InboxUnreadCountSchema);
			expect(res.body.count).toBe(1);
		});
	});
	describe('POST /user/inbox/markAllRead', () => {
		it('Marks all messages as read', async () => {
			const Message = await factories.message.create({ person: personId });
			const res = await request(server)
				.post('/v1/user/inbox/markAllRead')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(204);
			expect(res).not.toBeProblemResponse();
			const message = await messageRepo.getMessage(db,Message.id);
			expect(message?.read_at).not.toBeNull();

		});
	});
	describe('POST /user/inbox/{messageId}/markRead', () => {
		it('Marks a message as read', async () => {
			const Message = await factories.message.create({ person: personId });

			const res = await request(server)
				.post(`/v1/user/inbox/${Message.id}/markRead`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(204);

			expect(res).not.toBeProblemResponse();
			const message = await messageRepo.getMessage(db,Message.id,personId);
			expect(message?.read_at).not.toBeNull();

		});
		it('returns 404 when the message does not exist', async () => {
			const res = await request(server)
				.post(`/v1/user/inbox/${nonExistentId}/markRead`)
				.set('Accept', 'application/json')
				.asPerson(userkey);
			expect(res).toBeProblemResponse(404);
		});
	});
	describe('POST /user/inbox/{messageId}/markUnread', () => {
		it('Marks a message as unread', async () => {
			const Message = await factories.message.create({ person: personId });

			await request(server)
				.post(`/v1/user/inbox/${Message.id}/markRead`)
				.set('Accept', 'application/json')
				.asPerson(userkey);

			const res = await request(server)
				.post(`/v1/user/inbox/${Message.id}/markUnread`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(204);

			expect(res).not.toBeProblemResponse();
			const message = await messageRepo.getMessage(db,Message.id,personId);
			expect(message?.read_at).toBeNull();
		});
		it('returns 404 when the message does not exist', async () => {
			const res = await request(server)
				.post(`/v1/user/inbox/${nonExistentId}/markUnread`)
				.set('Accept', 'application/json')
				.asPerson(userkey);
			expect(res).toBeProblemResponse(404);
		});
	});
	describe('GET /user/inbox/{messageId}', () => {
		it('Gets a message by ID', async () => {
			const Message = await factories.message.create({ person: personId });

			const res = await request(server)
				.get(`/v1/user/inbox/${Message.id}`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);

			expect(res).not.toBeProblemResponse();
			expect(res.body).toMatchSchema(InboxMessageSchema);
		});
		it('returns 404 when the message does not exist', async () => {
			const res = await request(server)
				.get(`/v1/user/inbox/${nonExistentId}`)
				.set('Accept', 'application/json')
				.asPerson(userkey);
			expect(res).toBeProblemResponse(404);
		});
	});
	describe('DELETE /user/inbox/{messageId}', () => {
		it('Marks a message as deleted', async () => {
			const Message = await factories.message.create({ person: personId });

			const res = await request(server)
				.delete(`/v1/user/inbox/${Message.id}`)
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(204);

			expect(res).not.toBeProblemResponse();
			const message = await messageRepo.getMessage(db,Message.id,personId);
			expect(message?.deleted_at).not.toBeNull();

		});
		it('returns 404 when the message does not exist', async () => {
			const res = await request(server)
				.delete(`/v1/user/inbox/${nonExistentId}`)
				.set('Accept', 'application/json')
				.asPerson(userkey);

			expect(res).toBeProblemResponse(404);
		});
	});
});
