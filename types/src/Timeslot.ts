import { z } from 'zod';
import { datetime } from './utils.js';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';

export const TimeslotResponseSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer' },
		name: { type: 'string' },
		start: { type: 'string', format: 'date-time' },
		end: { type: 'string', format: 'date-time' },
		tournId: { type: 'integer' },
		updatedAt: { type: 'string', format: 'date-time' },
		createdAt: { type: 'string', format: 'date-time' },
	},
} as const satisfies ZodOpenApiSchemaObject;
export const TimeslotRequestSchema = z.object({
	name: z.string(),
	start: datetime(),
	end: datetime(),
	tourn: z.number().int(),
});