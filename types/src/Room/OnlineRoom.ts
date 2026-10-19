import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import * as utils from '../utils.js';

export const OnlineRoomSchema = z.object({
	name: z.string().nullable().meta({ description: 'The name of the room' }),
	joinable: z.boolean().meta({ description: 'Whether the person can join the room online' }),
	hybrid: z.boolean().meta({ description: 'Whether the room is a hybrid room with some participants in person' }),
	mapUrl: z.string().nullable().meta({ description: 'A map to the physical room' }),
}).strict().meta({
	id: 'OnlineRoom',
}) satisfies ZodOpenApiSchemaObject;

export type OnlineRoom = z.infer<typeof OnlineRoomSchema>;

export const OnlineRoomJoinSchema = z.object({
	url: z.string().meta({ description: 'The URL to open, or for NSDA Campus the URL to post the token to' }),
	token: z.string().nullable().meta({ description: 'The signed NSDA Campus token, posted as the form field json. null for other rooms' }),
	password: z.string().nullable().meta({ description: 'The password for the room' }),
}).strict().meta({
	id: 'OnlineRoomJoin',
}) satisfies ZodOpenApiSchemaObject;

export type OnlineRoomJoin = z.infer<typeof OnlineRoomJoinSchema>;

export const UtilityRoomSchema = OnlineRoomSchema.extend({
	id: utils.id.meta({ description: 'The id of the utility room within the tournament' }),
}).strict().meta({
	id: 'UtilityRoom',
}) satisfies ZodOpenApiSchemaObject;

export type UtilityRoom = z.infer<typeof UtilityRoomSchema>;
