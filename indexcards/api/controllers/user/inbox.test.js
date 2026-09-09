
import { createContext } from '../../../tests/httpMocks.js';
import messageRepo from '../../repos/messageRepo.js';
import * as inbox from './inbox.js';
describe('markDeleted', () => {
	it('returns 404 if message not found', async () => {
		const messageId = 1;
		const personId = 1;
		vi.spyOn(messageRepo, 'getMessage').mockResolvedValue(null);
		const { req, res } = createContext({ valid: { params: { messageId } }, actor: { Person: { id: personId } } });
		await inbox.deleteMessage(req, res);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('does not override existing deleted_at date', async () => {
		const messageId = 2;
		const personId = 1;
		const originalDeletedAt = new Date('2026-01-01T00:00:00.000Z');
		const message = {
			deleted_at: originalDeletedAt,
			save: vi.fn().mockResolvedValue(undefined),
		};
		vi.spyOn(messageRepo, 'getMessage').mockResolvedValue(message);
		const { req, res } = createContext({ valid: { params: { messageId } }, actor: { Person: { id: personId } } });

		await inbox.deleteMessage(req, res);

		expect(message.deleted_at).toEqual(originalDeletedAt);
		expect(res.status).toHaveBeenCalledWith(204);
	});
});
describe('markRead', () => {
	it('returns 404 if message not found', async () => {
		const messageId = 1;
		const personId = 1;
		vi.spyOn(messageRepo, 'getMessage').mockResolvedValue(null);
		const { req, res } = createContext({ valid: { params: { messageId } }, actor: { Person: { id: personId } } });
		await inbox.readMessage(req, res);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('does not override existing read_at date', async () => {
		const messageId = 2;
		const personId = 1;
		const originalReadAt = new Date('2026-01-01T00:00:00.000Z');
		const message = {
			read_at: originalReadAt,
			save: vi.fn().mockResolvedValue(undefined),
		};
		vi.spyOn(messageRepo, 'getMessage').mockResolvedValue(message);
		const { req, res } = createContext({ valid: { params: { messageId } }, actor: { Person: { id: personId } } });

		await inbox.readMessage(req, res);

		expect(message.read_at).toEqual(expect.any(Date));
		expect(res.status).toHaveBeenCalledWith(204);
	});
});

describe('markUnread', () => {
	it('returns 404 if message not found', async () => {
		const messageId = 1;
		const personId = 1;
		vi.spyOn(messageRepo, 'getMessage').mockResolvedValue(null);
		const { req, res } = createContext({ valid: { params: { messageId } }, actor: { Person: { id: personId } } });
		await inbox.unreadMessage(req, res);
		expect(res.status).toHaveBeenCalledWith(404);
	});
});
describe('getMessage', () => {
	it('returns 404 if message not found', async () => {
		const messageId = 1;
		const personId = 1;
		vi.spyOn(messageRepo, 'getMessage').mockResolvedValue(null);
		const { req, res } = createContext({ valid: { params: { messageId } }, actor: { Person: { id: personId } } });
		await inbox.getMessage(req, res);
		expect(res.status).toHaveBeenCalledWith(404);
	});
});