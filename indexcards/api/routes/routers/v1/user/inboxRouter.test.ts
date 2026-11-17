
import request from 'supertest';
import server from '../../../../../app.js';
import factories from '../../../../../tests/factories/index.js';
import { InboxMessageSchema, InboxPageSchema, InboxUnreadCountSchema } from '@tabroom/types';
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
			expect(res.body).toMatchSchema(InboxPageSchema);
			expect(res.body.items.length).toBe(1);
			expect(res.body.total).toBe(1);
			expect(res.body.items[0]).not.toHaveProperty('body');
			expect(res.body.items[0]).not.toHaveProperty('Email');
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
			const { items, total } = InboxPageSchema.parse(res.body);

			expect(items.some(message => message.id === DeletedMessage.id)).toBe(false);
			expect(items.some(message => message.id === InvisibleMessage.id)).toBe(false);
			expect(total).toBe(items.length);
		});
		describe('paging', () => {
			let pagedKey: string;
			let newestFirst: number[];
			beforeAll(async () => {
				const Person = await factories.person.create();
				({ userkey: pagedKey } = await factories.session.create({ person: Person.id }));
				const created = await Promise.all(Array.from({ length: 52 }, (_, minute) => factories.message.create({
					person: Person.id,
					visible_at: new Date(Date.UTC(2026, 9, 1, 12, minute)),
				})));
				newestFirst = created.map(message => message.id).reverse();
			});
			const page = (query = '') => request(server)
				.get(`/v1/user/inbox${query}`)
				.set('Accept', 'application/json')
				.asPerson(pagedKey);

			it('returns the newest 50 when no page is asked for', async () => {
				const res = await page().expect(200);
				expect(res.body).toMatchSchema(InboxPageSchema);
				expect(res.body.items.map((message: { id: number }) => message.id)).toEqual(newestFirst.slice(0, 50));
				expect(res.body.total).toBe(52);
			});
			it('returns the page that limit and offset ask for', async () => {
				const res = await page('?limit=20&offset=40').expect(200);
				expect(res.body.items.map((message: { id: number }) => message.id)).toEqual(newestFirst.slice(40));
				expect(res.body.total).toBe(52);
			});
			it.each(['limit=0', 'limit=101', 'limit=ten', 'offset=-1'])('rejects %s', async (query) => {
				const res = await page(`?${query}`);
				expect(res).toBeProblemResponse(400);
			});
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
		it('cleans a body another system wrote as typed', async () => {
			const Email = await factories.email.create({ content: '<p>Schedule</p><iframe src="https://example.com"></iframe>' });
			const Message = await factories.message.create({
				person: personId,
				email: Email.id,
				body: '<p onclick="alert(1)">Room <b>12</b></p><script>alert(1)</script><img src="https://example.com/map.png" style="position: fixed;">',
			});
			const clean = {
				body: '<p>Room <b>12</b></p><img src="https://example.com/map.png" />',
				Email: { content: '<p>Schedule</p>' },
			};

			const res = await request(server).get(`/v1/user/inbox/${Message.id}`).asPerson(userkey).expect(200);
			expect(res.body).toMatchObject(clean);
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
	describe('messages the inbox hides', () => {
		// A message with no visible_at is a delivery record that no inbox shows
		const invisible = () => factories.message.create({ person: personId, visible_at: null });
		const deleted = () => factories.message.create({ person: personId, deleted_at: faker.date.recent() });

		it.each([
			['GET', (id: number) => request(server).get(`/v1/user/inbox/${id}`)],
			['markRead', (id: number) => request(server).post(`/v1/user/inbox/${id}/markRead`)],
			['markUnread', (id: number) => request(server).post(`/v1/user/inbox/${id}/markUnread`)],
			['DELETE', (id: number) => request(server).delete(`/v1/user/inbox/${id}`)],
		])('%s returns 404 for a message that is not visible', async (_label, send) => {
			const Message = await invisible();

			const res = await send(Message.id).set('Accept', 'application/json').asPerson(userkey);

			expect(res).toBeProblemResponse(404);
		});

		it.each([
			['markRead', (id: number) => request(server).post(`/v1/user/inbox/${id}/markRead`)],
			['markUnread', (id: number) => request(server).post(`/v1/user/inbox/${id}/markUnread`)],
		])('%s returns 404 for a deleted message', async (_label, send) => {
			const Message = await deleted();

			const res = await send(Message.id).set('Accept', 'application/json').asPerson(userkey);

			expect(res).toBeProblemResponse(404);
			const row = await messageRepo.getMessage(db, Message.id, personId);
			expect(row?.read_at).toBeNull();
		});

		it('does not count a message that is not visible as unread', async () => {
			await invisible();
			await request(server).post('/v1/user/inbox/markAllRead').asPerson(userkey).expect(204);

			const res = await request(server)
				.get('/v1/user/inbox/unread')
				.set('Accept', 'application/json')
				.asPerson(userkey)
				.expect(200);

			expect(res.body).toMatchSchema(InboxUnreadCountSchema);
			expect(res.body.count).toBe(0);
		});
	});
});
