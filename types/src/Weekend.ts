import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';
import * as utils from './utils.js';

export const WeekendSchema = z.object({
	id: utils.id,
	tourn: utils.id.nullable(),
	name: z.string().max(63),
	city: z.string().max(31).nullable(),
	state: z.string().max(6).nullable(),
	site: utils.id.nullable(),
	start: z.iso.datetime(),
	end: z.iso.datetime(),
	reg_start: z.iso.datetime(),
	reg_end: z.iso.datetime(),
	drop_deadline: z.iso.datetime(),
	fine_deadline: z.iso.datetime(),
	freeze_deadline: z.iso.datetime(),
	judge_deadline: z.iso.datetime(),
	timestamp: z.iso.datetime(),
}).strict().meta({
	id: 'Weekend',
	description: 'A weekend of a multi-weekend tournament, such as a district tournament',
}) satisfies ZodOpenApiSchemaObject;

export type Weekend = z.infer<typeof WeekendSchema>;
