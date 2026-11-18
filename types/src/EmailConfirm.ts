import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';

export const EmailConfirmRequestSchema = z.object({
	code: z.string().trim().min(1).max(16).meta({ description: 'The confirmation code from the email, in any case' }),
}).strict().meta({
	id: 'EmailConfirmRequest',
	description: 'A confirmation code typed by the logged-in person',
}) satisfies ZodOpenApiSchemaObject;

export type EmailConfirmRequest = z.infer<typeof EmailConfirmRequestSchema>;

export const EmailConfirmStatusSchema = z.object({
	email: z.string().meta({ description: 'The address the link confirms, masked to its first letter and domain' }),
	confirmed: z.boolean().meta({ description: 'Whether the address is already confirmed' }),
}).strict().meta({
	id: 'EmailConfirmStatus',
	description: 'Which address a confirmation link is for and whether it is already confirmed',
}) satisfies ZodOpenApiSchemaObject;

export const EmailConfirmResponseSchema = z.object({
	confirmed: z.literal(true).meta({ description: 'Always true: the address is now confirmed' }),
	email: z.string().meta({ description: 'The address that was confirmed, masked to its first letter and domain' }),
}).strict().meta({
	id: 'EmailConfirmResponse',
	description: 'The result of using a confirmation link',
}) satisfies ZodOpenApiSchemaObject;
