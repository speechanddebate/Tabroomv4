import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';

export const RoomViewSchema = z.object({
	name: z.string().nullable().meta({ description: 'The name of the room' }),
	joinable: z.boolean().meta({ description: 'Whether the person can join the room online' }),
	hybrid: z.boolean().meta({ description: 'Whether the room is a hybrid room with some participants in person' }),
	mapUrl: z.string().nullable().meta({ description: 'A map to the physical room' }),
}).strict().meta({
	id: 'RoomView',
}) satisfies ZodOpenApiSchemaObject;

export type RoomView = z.infer<typeof RoomViewSchema>;
