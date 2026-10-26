import * as utils from './utils.js';
import { z } from 'zod';
import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { TournSchema } from './Tourn.js';
import { WeekendSchema } from './Weekend.js';
import { RoundSchema } from './Round.js';
import { EventSchema } from './Event.js';
import { RoomSchema } from './Room.js';
import { EntrySchema } from './Entry.js';

export const JudgeSchema = z.object({
	id: utils.id,
	code: z.string().max(8).nullable(),
	first: z.string().max(63).nullable(),
	middle: z.string().max(63).nullable(),
	last: z.string().max(63).nullable(),
	obligation: z.int().nullable(),
}).meta({ id: 'Judge'}) satisfies ZodOpenApiSchemaObject;

export type Judge = z.infer<typeof JudgeSchema>;

export const UnlinkedJudgeSchema = z.object({
	id: utils.id,
	type: z.enum(['judge', 'chapter_judge']),
	first: z.string().nullable(),
	last: z.string().nullable(),
	schoolName: z.string().nullish(),
	tournName: z.string().nullish(),
	tournCount: z.number().int().nonnegative().optional(), // for chapter judges
}) satisfies ZodOpenApiSchemaObject;

export type UnlinkedJudge = z.infer<typeof UnlinkedJudgeSchema>;
/**
 *  A record of a judge's decision. used in paradigm record
 */
export const JudgeRecordSchema = z.object({
	Tourn: z.object({
		id: utils.id.meta({
			description: 'Tournament id',
		}),
		name: z.string().meta({
			description: 'Tournament name',
		}),
	}).meta({
		description: 'Tournament details',
	}),
	roundDate: z.string().meta({
		description: 'Date of the round',
		format: 'date-time',
	}),
	roundLabel: z.string().meta({
		description: 'Label for the round (e.g., R2)',
	}),
	eventAbbr: z.string().meta({
		description: 'Event abbreviation (e.g., PF)',
	}),
	affTeam: z.string().meta({
		description: 'Affirmative team name',
	}),
	affLabel: z.string().meta({
		description: 'Affirmative label (e.g., Pro)',
	}),
	negTeam: z.string().meta({
		description: 'Negative team name',
	}),
	negLabel: z.string().meta({
		description: 'Negative label (e.g., Con)',
	}),
	vote: z.string().meta({
		description: "This judge's vote (e.g., Con)",
	}),
	panelVote: z.string().meta({
		description: 'Panel majority vote (e.g., Con)',
	}),
	record: z.string().meta({
		description: 'Win-loss record for the round (e.g., 0-1)',
	}),
}).meta({
	id: 'JudgeRecord',
	description: "A record of a judge's decision. used in paradigm details",
}) satisfies ZodOpenApiSchemaObject;

export type JudgeRecord = z.infer<typeof JudgeRecordSchema>;

export const JudgeHistorySchema = z.object({
	id: JudgeSchema.shape.id.meta({ description: 'Judge id' }),
	Tourn: z.object({
		id: utils.id.meta({
			description: 'Tournament id',
		}),
		name: z.string().meta({ description: 'Tournament name' }),
		start: z.iso.datetime().meta({
			description: 'Tournament start (UTC)',
		}),
		end: z.iso.datetime().meta({
			description: 'Tournament end (UTC)',
		}),
		tz: TournSchema.shape.tz.meta({
			description: 'IANA time zone of the tournament',
		}),
	}).strict().meta({
		description: 'Tournament details',
	}),
	Weekend: WeekendSchema.pick({ id: true, name: true, start: true, end: true }).nullable().meta({
		description: "The weekend the judge's category is assigned to, when the tournament uses weekends",
	}),
	division: z.string().meta({ description: 'Division name (e.g., Open, JV)' }),
	roundsJudged: z.number().int().nonnegative().meta({
		description: 'Number of rounds judged at the tournament',
	}),
	roundsObligated: z.number().int().nonnegative().meta({
		description: 'Number of rounds obligated at the tournament',
	}),
}).strict().meta({
	id: 'JudgeHistory',
	description: "A person's history of judging",
}) satisfies ZodOpenApiSchemaObject;

export type JudgeHistory = z.infer<typeof JudgeHistorySchema>;

export const JudgeHistoryPageSchema = utils.paginated(JudgeHistorySchema).meta({
	id: 'JudgeHistoryPage',
	description: "One page of a person's judging history",
}) satisfies ZodOpenApiSchemaObject;

export type JudgeHistoryPage = z.infer<typeof JudgeHistoryPageSchema>;

export const JudgeHistoryPanelSchema = z.object({
	id: utils.id.meta({ description: 'Section id' }),
	flight: z.int().positive().nullable().meta({ description: 'Flight number; null when the round is not flighted' }),
	start: z.iso.datetime().nullable().meta({ description: 'Scheduled start of the round (UTC)' }),
	Round: z.object({
		id: RoundSchema.shape.id,
		name: RoundSchema.shape.name,
		label: RoundSchema.shape.label,
		type: RoundSchema.shape.type,
	}).strict(),
	Event: z.object({
		id: utils.id,
		abbr: EventSchema.shape.abbr,
		type: EventSchema.shape.type,
	}).strict(),
	Room: z.object({
		id: RoomSchema.shape.id,
		name: RoomSchema.shape.name,
	}).strict().nullable().meta({ description: 'null when no room is assigned' }),
	Entries: z.array(z.object({
		id: EntrySchema.shape.id,
		code: EntrySchema.shape.code,
		name: z.string().nullable(),
		side: z.string().nullable().meta({ description: 'Side or position label for the entry (e.g., Aff, Con, 1G)' }),
		speakerOrder: z.int().nullable(),
	}).strict()),
}).strict().meta({
	id: 'JudgeHistoryPanel',
	description: 'A section a judge was assigned to',
}) satisfies ZodOpenApiSchemaObject;

export type JudgeHistoryPanel = z.infer<typeof JudgeHistoryPanelSchema>;

export const JudgeTournRecordSchema = z.object({
	id: JudgeSchema.shape.id,
	code: z.string().nullable().meta({ description: 'Judge code; null when the category hides codes' }),
	obligation: z.int().nonnegative().meta({ description: 'Rounds owed for the school' }),
	hired: z.int().nonnegative().meta({ description: 'Rounds hired' }),
	roundsJudged: z.int().nonnegative().meta({ description: 'Number of distinct rounds with a ballot for this judge' }),
	flightsJudged: z.int().nonnegative().meta({ description: 'Number of distinct sections with a ballot for this judge' }),
	School: z.object({
		id: utils.id,
		name: z.string().nullable(),
	}).strict().nullable().meta({ description: 'School the judge was entered by; null for volunteers and hires' }),
	Category: z.object({
		id: utils.id,
		name: z.string().nullable(),
		abbr: z.string().nullable(),
	}).strict(),
	Panels: z.array(JudgeHistoryPanelSchema).meta({ description: 'Published sections not yet past primary results' }),
}).strict().meta({
	id: 'JudgeTournRecord',
	description: "A person's judge record at one tournament",
}) satisfies ZodOpenApiSchemaObject;

export type JudgeTournRecord = z.infer<typeof JudgeTournRecordSchema>;

export const JudgeTournHistorySchema = z.object({
	Tourn: z.object({
		id: TournSchema.shape.id,
		name: TournSchema.shape.name,
		webname: TournSchema.shape.webname,
		start: z.iso.datetime().meta({ description: 'Tournament start (UTC)' }),
		end: z.iso.datetime().meta({ description: 'Tournament end (UTC)' }),
		tz: TournSchema.shape.tz,
	}).strict(),
	Judges: z.array(JudgeTournRecordSchema).meta({ description: "The person's judge records at the tournament, one per category" }),
}).strict().meta({
	id: 'JudgeTournHistory',
	description: "A person's judging history at one tournament",
}) satisfies ZodOpenApiSchemaObject;

export type JudgeTournHistory = z.infer<typeof JudgeTournHistorySchema>;

export const JudgeLiveDocSchema = z.object({
	judgeId: z.coerce.number().int(),
	categoryAbbr: z.string(),
	tournName: z.string(),
	tournEnd: z.iso.datetime(),
	tournTz: z.string(),
	url: z.string(),
	caption: z.string().nullable(),
}).meta({
	id: 'JudgeLiveDoc',
	description: 'A live doc link for a category the logged in user is judging in',
}) satisfies ZodOpenApiSchemaObject;

export type JudgeLiveDoc = z.infer<typeof JudgeLiveDocSchema>;
