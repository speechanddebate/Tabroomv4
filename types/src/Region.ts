import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';
import * as utils from './utils.js';

export const RegionSchema = z.object({
	id: utils.id,
	name: z.string().nullable(),
	code: z.string().nullable(),
	tourn: utils.id.nullable(),
}).strict().meta({
	id: 'Region',
}) satisfies ZodOpenApiSchemaObject;

export type Region = z.infer<typeof RegionSchema>;
