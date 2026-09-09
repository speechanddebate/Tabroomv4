import { NotFound } from '../../helpers/problem.js';
import messageRepo from '../../repos/messageRepo.js';
import { db } from '../../data/database.js';

import type { Request, Response } from 'express';

export const inboxList = async (req: Request, res: Response) => {
	const personId = req.actor.Person?.id;
	const messages = await messageRepo.getMessages(db, personId ?? 0);
	return res.status(200).json(messages);
};

export const getUnreadCount = async (req: Request, res: Response) => {
    const personId = req.actor.Person?.id;

    if (!personId) {
        return res.status(400).json({ error: 'Person ID is required' });
    }

    const result = await db
        .selectFrom('message')
        .where('person', '=', personId)
        .where('deleted_at', 'is', null)
        .where('visible_at', '<', new Date())
        .where('read_at', 'is', null)
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();

    return res.status(200).json({ count: result.count });
};	

export const readAllMessages = async (req: Request, res: Response) => {
	await db
		.updateTable('message')
		.set({ read_at: new Date() })
		.where('person', '=', req.actor.Person?.id ?? 0)
		.where('deleted_at', 'is', null)
		.where('visible_at', '<', new Date())
		.where('read_at', 'is', null)
		.execute();
	return res.status(204).end();
};

export const getMessage = async (req: Request, res: Response) => {
	const message = await messageRepo.getMessage(db,req.valid.params.messageId, req.actor.Person?.id);
	if(!message) return NotFound(req,res,'Message not found');
	return res.status(200).json(message);
};

export const readMessage = async (req: Request, res: Response) => {
	const message = await messageRepo.getMessage(db, req.valid.params.messageId, req.actor.Person?.id);
	if(!message) return NotFound(req,res,'Message not found');
	await db
		.updateTable('message')
		.set({ read_at: new Date() })
		.where('id', '=', req.valid.params.messageId)
		.where('person', '=', req.actor.Person?.id ?? 0)
		.execute();
	return res.status(204).end();
};

export const unreadMessage = async (req: Request, res: Response) => {
	const message = await messageRepo.getMessage(db, req.valid.params.messageId, req.actor.Person?.id);
	if(!message) return NotFound(req,res,'Message not found');
	await db
		.updateTable('message')
		.set({ read_at: null })
		.where('id', '=', req.valid.params.messageId)
		.where('person', '=', req.actor.Person?.id ?? 0)
		.execute();
	return res.status(204).end();
};

export const deleteMessage = async (req: Request, res: Response) => {
	const message = await messageRepo.getMessage(db, req.valid.params.messageId, req.actor.Person?.id);
	if(!message) return NotFound(req,res,'Message not found');
	await db
		.updateTable('message')
		.set({ deleted_at: new Date() })
		.where('id', '=', req.valid.params.messageId)
		.where('person', '=', req.actor.Person?.id ?? 0)
		.execute();
	return res.status(204).end();
};

export default inboxList;
