import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';
import * as utils from './utils.js';

/** A conflict or unavailability recorded against a judge at a tournament, as the judge may see it */
export const StrikeSchema = z.object({
	id: utils.id,
	type: z.enum(['school', 'entry', 'region', 'departure', 'time']).meta({ description: 'What the strike is against: a school, an entry, a region (mock trial), or a time the judge is unavailable (departure runs to the end of the tournament)' }),
	start: z.iso.datetime().nullable().meta({ description: 'The start of the unavailable window in UTC, for departure and time strikes' }),
	end: z.iso.datetime().nullable().meta({ description: 'The end of the unavailable window in UTC, for time strikes' }),
	school: utils.id.nullable(),
	School: z.object({
		name: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The school the strike is against, for school strikes' }),
	entry: utils.id.nullable(),
	Entry: z.object({
		code: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The entry the strike is against, for entry strikes' }),
	region: utils.id.nullable(),
	Region: z.object({
		name: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The region the strike is against, for region strikes' }),
}).strict().meta({
	id: 'Strike',
}) satisfies ZodOpenApiSchemaObject;

export type Strike = z.infer<typeof StrikeSchema>;
