import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';

export const UnsubscribeStatusSchema = z.object({
	email: z.string().meta({ description: 'The address the link is for, masked to its first letter and domain' }),
	noEmail: z.boolean().meta({ description: 'Whether this person is already opted out of Tabroom email' }),
}).strict().meta({
	id: 'UnsubscribeStatus',
	description: 'Who an unsubscribe link is for and whether it has already been used',
}) satisfies ZodOpenApiSchemaObject;

export const UnsubscribeResponseSchema = z.object({
	unsubscribed: z.literal(true).meta({ description: 'Always true: the person is now opted out of Tabroom email' }),
	email: z.string().meta({ description: 'The address that was opted out, masked to its first letter and domain' }),
}).strict().meta({
	id: 'UnsubscribeResponse',
	description: 'The result of using an unsubscribe link',
}) satisfies ZodOpenApiSchemaObject;
