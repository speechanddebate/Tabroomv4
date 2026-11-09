import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import * as utils from '../utils.js';
import { RoomViewSchema } from './RoomView.js';

export const OnlineRoomJoinSchema = z.object({
	url: z.string().meta({ description: 'The URL to open, or for NSDA Campus the URL to post the token to' }),
	token: z.string().nullable().meta({ description: 'The signed NSDA Campus token, posted as the form field json. null for other rooms' }),
	password: z.string().nullable().meta({ description: 'The password for the room' }),
}).strict().meta({
	id: 'OnlineRoomJoin',
}) satisfies ZodOpenApiSchemaObject;

export type OnlineRoomJoin = z.infer<typeof OnlineRoomJoinSchema>;

export const TournRoomSchema = RoomViewSchema.extend({
	kind: z.enum(['school', 'prep', 'utility']).meta({ description: 'Which join endpoint opens the room: a school squad room, an entry prep room, or a tournament utility room' }),
	id: utils.id.meta({ description: 'The school, entry, or utility room id the join endpoint takes' }),
}).strict().meta({
	id: 'TournRoom',
	description: "A room the tournament provides outside any round: a school's squad room, an entry's prep room, or a tournament utility room. id is the school, entry, or utility room id the matching join endpoint takes.",
}) satisfies ZodOpenApiSchemaObject;

export type TournRoom = z.infer<typeof TournRoomSchema>;
