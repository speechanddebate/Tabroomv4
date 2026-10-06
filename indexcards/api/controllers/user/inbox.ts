import { NotFound } from '../../helpers/problem.js';
import messageRepo from '../../repos/messageRepo.js';
import { db } from '../../data/database.js';
import { getPerson } from '../../middleware/authorization/authorization.js';

import type { Request, Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';

export const inboxList = async (req: Request, res: Response) => {
	const person = getPerson(req);
	const messages = await messageRepo.getMessages(db, person.id,{
		excludeDeleted: true,
		excludeInvisible: true
	});
	return res.status(200).json(messages);
};

export const getUnreadCount = async (req: Request, res: Response) => {
    const person = getPerson(req);

    const result = await db
        .selectFrom('message')
        .where('person', '=', person.id)
        .where('deleted_at', 'is', null)
        .where('visible_at', '<', new Date())
        .where('read_at', 'is', null)
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

    return res.status(200).json({ count: result.count });
};

export const readAllMessages = async (req: Request, res: Response) => {
	const person = getPerson(req);
	await db
		.updateTable('message')
		.set({ read_at: new Date() })
		.where('person', '=', person.id)
		.where('deleted_at', 'is', null)
		.where('visible_at', '<', new Date())
		.where('read_at', 'is', null)
		.execute();
	return res.status(204).end();
};

export const getMessage = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	const message = await messageRepo.getMessage(db,req.params.messageId, person.id);
	if(!message) return NotFound(req,res,'Message not found');
	return res.status(200).json(message);
};

export const readMessage = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	const message = await messageRepo.getMessage(db, req.params.messageId, person.id);
	if(!message) return NotFound(req,res,'Message not found');
	await db
		.updateTable('message')
		.set({ read_at: new Date() })
		.where('id', '=', req.params.messageId)
		.where('person', '=', person.id)
		.execute();
	return res.status(204).end();
};

export const unreadMessage = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	const message = await messageRepo.getMessage(db, req.params.messageId, person.id);
	if(!message) return NotFound(req,res,'Message not found');
	await db
		.updateTable('message')
		.set({ read_at: null })
		.where('id', '=', req.params.messageId)
		.where('person', '=', person.id)
		.execute();
	return res.status(204).end();
};

export const deleteMessage = async (req: ValidatedRequest, res: Response) => {
	const person = getPerson(req);
	const message = await messageRepo.getMessage(db, req.params.messageId, person.id);
	if(!message) return NotFound(req,res,'Message not found');
	await db
		.updateTable('message')
		.set({ deleted_at: new Date() })
		.where('id', '=', req.params.messageId)
		.where('person', '=', person.id)
		.execute();
	return res.status(204).end();
};

export default inboxList;
