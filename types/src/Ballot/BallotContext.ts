import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import * as utils from '../utils.js';
import { EntrySchema } from '../Entry.js';
import { EventSchema } from '../Event.js';
import { JudgeSchema } from '../Judge.js';
import { RoomSchema } from '../Room.js';
import { RoundSchema } from '../Round.js';
import { CurrentBallotSchema } from '../Section.js';
import { StudentSchema } from '../Student.js';
import { TournSchema } from '../Tourn.js';

// Everything needed to render one judge's ballot for one panel.
// Shared base + a details block per event type, discriminated on eventType.
// Scoring rules come from the tiebreak protocol, not the event type: a block
// being present in `scoring` turns that kind of scoring on.

export const BallotScoringSchema = z.object({
	winloss: z.object({
		lpw: z.enum(['forbid', 'confirm']).meta({
			description: 'forbid: the winner must have higher points (no_lpw). confirm: the judge must confirm a low-point win.',
		}),
	}).strict().optional(),
	points: z.object({
		min: z.number(),
		max: z.number(),
		step: z.number().positive().meta({ description: 'From point_increments: 1, 0.5, 0.25 or 0.1' }),
		ties: z.boolean().meta({ description: 'Allow two speakers on this ballot to receive the same points (point_ties)' }),
		team: z.boolean().meta({ description: 'Points per entry (team_points) instead of per speaker' }),
	}).strict().optional(),
	ranks: z.object({}).strict().optional().meta({
		description: 'Present when the protocol uses ranks. Options get added with speech.',
	}),
}).strict().meta({
	id: 'BallotScoring',
}) satisfies ZodOpenApiSchemaObject;
export type BallotScoring = z.infer<typeof BallotScoringSchema>;

export const BallotStudentSchema = z.object({
	id: StudentSchema.shape.id,
	first: StudentSchema.shape.first,
	middle: StudentSchema.shape.middle,
	last: StudentSchema.shape.last,
	pronoun: z.string().nullable().meta({ description: 'null when the tournament sets limit_info' }),
	points: z.number().nullable(),
	rank: z.int().positive().nullable(),
}).strict().meta({
	id: 'BallotStudent',
}) satisfies ZodOpenApiSchemaObject;
export type BallotStudent = z.infer<typeof BallotStudentSchema>;

export const BallotEntrySchema = z.object({
	ballotId: utils.id,
	entryId: EntrySchema.shape.id,
	code: EntrySchema.shape.code,
	side: z.int().min(1).max(2).nullable(),
	speakerOrder: z.int().nonnegative().nullable(),
	notes: z.string().nullable().meta({ description: 'Accommodations note (entry ballot_notes)' }),
	points: z.number().nullable().meta({ description: 'Team points, when scoring.points.team' }),
	comments: z.string().nullable(),
	Students: z.array(BallotStudentSchema),
}).strict().meta({
	id: 'BallotEntry',
}) satisfies ZodOpenApiSchemaObject;
export type BallotEntry = z.infer<typeof BallotEntrySchema>;

const BallotBaseSchema = z.object({
	judgeId: JudgeSchema.shape.id,
	panelId: utils.id,
	tournId: TournSchema.shape.id,
	tz: TournSchema.shape.tz,
	status: z.enum(['not_started', 'started', 'scored', 'confirmed']),
	supported: z.boolean().meta({ description: 'false sends the judge to the classic ballot' }),
	notMe: z.boolean().meta({ description: 'Caller is a site admin or tournament owner entering for the judge' }),
	readOnly: z.boolean().meta({ description: 'Confirmed, and the caller is not a site admin' }),
	Event: z.object({
		id: EventSchema.shape.id,
		abbr: EventSchema.shape.abbr,
	}).strict(),
	Round: z.object({
		id: RoundSchema.shape.id,
		name: RoundSchema.shape.name,
		label: RoundSchema.shape.label,
		type: RoundSchema.shape.type,
		flight: z.int().positive().nullable().meta({ description: 'null if not flighted' }),
		start: z.iso.datetime().meta({ description: 'Includes flight_offset' }),
		deadline: z.iso.datetime().nullable().meta({ description: 'prelim/elim_decision_deadline after start, plus flight_offset' }),
		notes: z.string().nullable(),
	}).strict(),
	Room: z.object({
		id: RoomSchema.shape.id.nullable(),
		name: RoomSchema.shape.name.nullable(),
		url: RoomSchema.shape.url,
		onlineMode: z.enum(['none', 'sync', 'async', 'nsda_campus', 'nsda_campus_observers', 'public_jitsi', 'public_jitsi_observers']).nullable(),
	}).strict(),
	Judge: z.object({
		id: JudgeSchema.shape.id,
		code: JudgeSchema.shape.code,
		first: JudgeSchema.shape.first,
		middle: JudgeSchema.shape.middle,
		last: JudgeSchema.shape.last,
		chair: z.boolean(),
		chairLabel: z.string().nullable(),
	}).strict(),
	text: z.object({
		header: z.string().nullable().meta({ description: 'NSDA district/nationals ballot header (HTML)' }),
		biasStatement: z.string().nullable(),
		rules: z.array(z.string()).meta({ description: 'In display order: ballot_rules_chair (chair only), then ballot_rules unless the chair has chair_ballot_only (HTML)' }),
		topic: z.object({
			label: z.enum(['Resolution', 'Topic', 'Motion']),
			text: z.string(),
		}).strict().nullable(),
	}).strict(),
	rfd: z.string().nullable(),
	minWords: z.object({
		rfd: z.int().nonnegative().nullable().meta({ description: 'rfd_plz' }),
		comments: z.int().nonnegative().nullable().meta({ description: 'comments_plz, per entry' }),
	}).strict(),
	scoring: BallotScoringSchema,
	Entries: z.array(BallotEntrySchema),
});

export const DebateDetailsSchema = z.object({
	affLabel: z.string(),
	negLabel: z.string(),
	sidesLocked: z.boolean().meta({ description: 'Sides set by tab; the judge cannot pick them' }),
	flipOnline: z.boolean(),
	flipStatus: CurrentBallotSchema.shape.flipStatus,
	winnerBallotId: utils.id.nullable(),
}).strict().meta({
	id: 'DebateDetails',
}) satisfies ZodOpenApiSchemaObject;
export type DebateDetails = z.infer<typeof DebateDetailsSchema>;

export const DebateBallotContextSchema = BallotBaseSchema.extend({
	eventType: z.literal('debate'),
	debate: DebateDetailsSchema,
}).strict().meta({
	id: 'DebateBallotContext',
}) satisfies ZodOpenApiSchemaObject;
export type DebateBallotContext = z.infer<typeof DebateBallotContextSchema>;

export const BallotContextSchema = z.discriminatedUnion('eventType', [
	DebateBallotContextSchema,
]).meta({
	id: 'BallotContext',
}) satisfies ZodOpenApiSchemaObject;
export type BallotContext = z.infer<typeof BallotContextSchema>;
