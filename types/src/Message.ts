import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import * as utils from './utils.js';

export const InboxMessageSchema = z.object({
	id: utils.id.meta({ description: 'The unique identifier for the message' }),
	subject: z.string().max(255).nullable().meta({ description: 'The subject of the message' }),
	body: z.string().max(65535).nullable().meta({ description: 'The body of the message' }),
	url: z.url().max(511).nullable().meta({ description: 'The URL associated with the message' }),
	visible_at: z.string().nullable().meta({ description: 'The timestamp when the message became visible' }),
	read_at: z.string().nullable().meta({ description: 'The timestamp when the message was read' }),
	Tourn: z.object({
		id: utils.id.meta({ description: 'The unique identifier for the tournament' }),
		name: z.string().max(63).nullable().meta({ description: 'The name of the tournament' }),
		webname: z.string().max(64).nullable().meta({ description: 'The web name of the tournament' }),
	}).strict().nullable().meta({ description: 'The tournament associated with the message' }),
	Sender: z.object({
		name: z.string().nullable().meta({ description: 'The name of the sender' }),
		email: z.string().max(127).nullable().meta({ description: 'The email of the sender' }),
	}).strict().nullable().meta({ description: 'The sender of the message' }),
	Email: z.object({
		content: z.string().nullable().meta({ description: 'The content of the email' }),
	}).nullable().meta({ description: 'The email associated with the message' }),
}).meta({
	id: 'InboxMessage',
}) satisfies ZodOpenApiSchemaObject;

/** The list leaves out bodies; the reader loads the whole message by id */
export const InboxListItemSchema = InboxMessageSchema.omit({ body: true, Email: true }).strict().meta({
	id: 'InboxListItem',
	description: 'A message in the inbox list, without its body',
}) satisfies ZodOpenApiSchemaObject;

export const InboxPageQuerySchema = z.object({
	limit: utils.limit.max(100).default(50).meta({ description: 'The number of messages to return' }),
	offset: utils.offset.default(0).meta({ description: 'The number of messages to skip' }),
});

export const InboxPageSchema = utils.paginated(InboxListItemSchema).meta({
	id: 'InboxPage',
	description: "One page of a person's inbox, newest first",
}) satisfies ZodOpenApiSchemaObject;

export const InboxUnreadCountSchema = z.object({
	count: z.number().int().nonnegative().meta({ description: 'The number of unread messages' }),
}).meta({
	id: 'InboxUnreadCount',
	description: 'The count of unread messages for the logged in user',
}) satisfies ZodOpenApiSchemaObject;

export type InboxUnreadCount = z.infer<typeof InboxUnreadCountSchema>;