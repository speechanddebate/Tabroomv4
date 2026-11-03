import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { BallotSchema } from './Ballot/Ballot.js';
import { JudgeSchema } from './Judge.js';
import { EventSchema } from './Event.js';
import { EntrySchema } from './Entry.js';
import { RoundSchema } from './Round.js';
import { TournSchema } from './Tourn.js';
import { RoomSchema } from './Room/Room.js';
import { OnlineRoomSchema } from './Room/OnlineRoom.js';
import * as utils from './utils.js';

export const CurrentBallotSchema = z.object({
	id: utils.id,
	name: RoundSchema.shape.name,
	label: RoundSchema.shape.label,
	flipStatus: z.enum(['done','winner','loser','anyone']).nullable(),
	flight: z.int().positive().nullable().meta({ description: "null if not flighted. otherwise flight num."}),
	show_async: z.boolean(),
	onlineBallots: z.boolean().meta({ description: 'true if the tournament uses online ballots'}),
	legion: z.boolean(),
	start: z.iso.datetime(),
	deadline: z.iso.datetime(),
	roomId: RoomSchema.shape.id.nullable(),
	Room: OnlineRoomSchema.nullable().meta({ description: 'The section\'s room as this person sees it, and whether they can join it online' }),
	roomNotes: RoomSchema.shape.notes.nullable(),
	JudgeId: JudgeSchema.shape.id,
	RoundId: RoundSchema.shape.id,
	status: z.enum(['not_started','started','scored']),
	startText: z.string().max(127).nullable(),
	ballotText: z.string().max(127).nullable(),
	chair: z.boolean(),
	audited: z.boolean(),
	tourn: TournSchema.shape.id,
	TournTz: TournSchema.shape.tz,
	eventName: EventSchema.shape.name.meta({ description: 'The name of the event' }),
	eventAbbr: EventSchema.shape.abbr.meta({ description: 'The abbreviation of the event' }),
	eventType: EventSchema.shape.type,
	onlineMode: EventSchema.shape.settings.shape.online_mode,
	Entries: z.array(z.object({
		id: EntrySchema.shape.id,
		code: EntrySchema.shape.code,
		side: z.string().nullable(),
		speakerOrder: BallotSchema.shape.speakerOrder.nullable(),
	}).strict()),
}).strict().meta({
	id: 'CurrentBallot',
}) satisfies ZodOpenApiSchemaObject;
export type CurrentBallot = z.infer<typeof CurrentBallotSchema>;
