import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';
import * as utils from './utils.js';
import { TournSchema } from './Tourn.js';
import { JudgeSchema } from './Judge.js';
import { EntrySchema } from './Entry.js';
import { EventSchema } from './Event.js';
import { RoundSchema } from './Round.js';
import { RoomSchema } from './Room/Room.js';
import { TournRoomSchema } from './Room/OnlineRoom.js';
import { CurrentBallotSchema } from './Section.js';
import { FineSchema } from './Fine.js';
import { StrikeSchema } from './Strike.js';
import { TimeslotResponseSchema } from './Timeslot.js';

// Everything the user home page needs to draw one card per tournament, in one response.
// Times are ISO UTC; the UI formats them in the tournament's time zone.

export const HomeRoleSchema = z.enum(['judge', 'competitor', 'coach', 'tab']);

export type HomeRole = z.infer<typeof HomeRoleSchema>;

export const HomeAlertsSchema = z.object({
	paradigmReview: z.object({
		start: z.iso.datetime().meta({ description: 'When the current paradigm review window opened' }),
		lastReviewed: z.iso.datetime().nullable().meta({ description: 'When the person last saved or approved their paradigm' }),
	}).strict().nullable().meta({ description: 'Present when a paradigm review window is open and the paradigm is older than its start' }),
	emailUnconfirmed: z.boolean().meta({ description: 'Whether the account email is still unconfirmed' }),
	tzMissing: z.boolean().meta({ description: 'Whether the person has no time zone set while they have a running or upcoming tournament' }),
}).strict().meta({
	id: 'HomeAlerts',
}) satisfies ZodOpenApiSchemaObject;

export type HomeAlerts = z.infer<typeof HomeAlertsSchema>;

export const HomeLiveDocSchema = z.object({
	category: utils.id,
	Category: z.object({
		name: z.string().nullable(),
		abbr: z.string().nullable(),
	}).strict(),
	url: z.string(),
	caption: z.string().nullable(),
}).strict().meta({
	id: 'HomeLiveDoc',
	description: 'A live document link a category publishes to its judges and competitors',
}) satisfies ZodOpenApiSchemaObject;

export type HomeLiveDoc = z.infer<typeof HomeLiveDocSchema>;

export const HomeJudgeSchema = z.object({
	id: JudgeSchema.shape.id,
	code: JudgeSchema.shape.code,
	obligation: JudgeSchema.shape.obligation,
	hired: z.int().nullable(),
	active: z.int(),
	category: utils.id,
	Category: z.object({
		id: utils.id,
		name: z.string().nullable(),
		abbr: z.string().nullable(),
	}).strict(),
	school: utils.id.nullable(),
	School: z.object({
		id: utils.id,
		name: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The school that entered the judge; null for a tournament hire' }),
	Jpools: z.array(z.object({
		id: utils.id,
		name: z.string().nullable(),
		site: utils.id.nullable(),
		Site: z.object({ name: z.string().nullable() }).strict().nullable(),
		message: z.string().nullable().meta({ description: "The pool's instructions to its judges" }),
	}).strict()).meta({ description: 'The judge pools shown to registrants; standby pools are left out' }),
	Standbys: z.array(z.object({
		jpool: utils.id,
		name: z.string().nullable(),
		Site: z.object({ name: z.string().nullable() }).strict().nullable(),
		message: z.string().nullable().meta({ description: "The pool's instructions to its judges" }),
		Timeslot: TimeslotResponseSchema.pick({ name: true, start: true, end: true }).strict().meta({ description: 'When the judge is on standby' }),
	}).strict()).meta({ description: 'The standby pools the judge is in, at running tournaments, until their timeslot ends' }),
	Training: z.object({
		event: utils.id,
		Event: z.object({
			abbr: z.string().nullable(),
			type: EventSchema.shape.type,
		}).strict(),
	}).strict().nullable().meta({ description: 'The event whose sample round the judge judges to finish ballot training; null when the category has no training or the judge has finished it' }),
	roundsJudged: z.int().meta({ description: 'The number of distinct panels the judge has judged, by audited ballots' }),
	ballotsEntered: z.int(),
	feedbackUntil: z.iso.datetime().nullable().meta({ description: 'Until when the judge may edit feedback on entered ballots' }),
	Strikes: z.array(StrikeSchema),
	tournConflicts: z.boolean().meta({ description: "Whether the judge's category takes conflicts entered by its judges" }),
	Quizzes: z.array(z.object({
		Quiz: z.object({
			id: utils.id,
			label: z.string().nullable(),
			approval: z.int().meta({ description: 'Whether completion needs approval from NSDA Learn' }),
		}).strict(),
		requiredBy: z.string().meta({ description: 'The category or pool that requires the quiz' }),
		PersonQuiz: z.object({
			completed: z.int(),
			approved_by: utils.id.nullable(),
			pending: z.int(),
		}).strict().nullable().meta({ description: "The person's attempt, if any" }),
	}).strict()).meta({ description: 'Questionnaires the judge must complete before judging' }),
	CurrentBallots: z.array(CurrentBallotSchema).meta({ description: 'The open panels the judge sits on, at running tournaments' }),
	Fines: z.array(FineSchema).meta({ description: 'Judge fines assessed against this judge: missed rounds and revoked bonds, never school fees' }),
}).strict().meta({
	id: 'HomeJudge',
	description: "One of the person's judge rows at a tournament",
}) satisfies ZodOpenApiSchemaObject;

export type HomeJudge = z.infer<typeof HomeJudgeSchema>;

export const HomeRoundSchema = z.object({
	id: RoundSchema.shape.id,
	name: RoundSchema.shape.name,
	label: RoundSchema.shape.label,
	type: RoundSchema.shape.type,
	published: z.int().nullable(),
	post_primary: z.int().nullable(),
	post_secondary: z.int().nullable(),
	post_feedback: z.int().nullable(),
	start: z.iso.datetime().nullable().meta({ description: 'When the flight the entry is in starts' }),
	side: z.int().nullable(),
	speakerorder: z.int().nullable(),
	Panel: z.object({
		id: utils.id,
		letter: z.string().nullable(),
		flight: z.int().nullable(),
		bye: z.int(),
		Flip: z.object({
			deadline: z.iso.datetime().meta({ description: 'When the current turn ends' }),
			won: z.boolean().meta({ description: 'Whether this entry won the coin toss' }),
			turn: z.enum(['mine', 'theirs', 'either']).meta({ description: 'Who may choose now: this entry, the other entry, or either one first' }),
			labels: z.tuple([z.string(), z.string()]).meta({ description: "The event's names for side 1 and side 2" }),
			teamOrder: z.boolean().meta({ description: 'Whether speaking order is chosen in the flip as well as side' }),
			side: z.int().nullable().meta({ description: "This entry's side once the side is chosen; null while it's open" }),
			order: z.int().nullable().meta({ description: "This entry's speaking order once it's chosen; null while it's open or not part of the flip" }),
		}).strict().nullable().meta({ description: 'The coin flip for this round while it is open to the entry' }),
	}).strict(),
	Room: z.object({
		name: RoomSchema.shape.name.nullable(),
		url: RoomSchema.shape.url,
	}).strict().nullable(),
	Opponents: z.array(z.object({
		entry: utils.id,
		code: EntrySchema.shape.code,
	}).strict()),
	Judges: z.array(z.object({
		id: JudgeSchema.shape.id,
		first: JudgeSchema.shape.first,
		last: JudgeSchema.shape.last,
		code: JudgeSchema.shape.code,
	}).strict()),
	Scores: z.array(z.object({
		judge: utils.id.nullable(),
		tag: z.string().nullable(),
		value: z.number(),
		student: utils.id.nullable().meta({ description: 'The student the score is for; null for an entry-level score' }),
	}).strict()),
	strikesDue: z.iso.datetime().nullable().meta({ description: 'When the strike card for this round is due' }),
}).strict().meta({
	id: 'HomeRound',
	description: "A round one of the person's entries is in, with what the round's publish levels allow",
}) satisfies ZodOpenApiSchemaObject;

export type HomeRound = z.infer<typeof HomeRoundSchema>;

export const HomeEntrySchema = z.object({
	id: EntrySchema.shape.id,
	code: EntrySchema.shape.code,
	name: z.string().nullable(),
	active: z.int(),
	dropped: z.int(),
	waitlist: z.int(),
	unconfirmed: z.int(),
	supp: z.boolean().meta({ description: 'Whether the event is a supplemental event' }),
	event: utils.id,
	Event: z.object({
		id: utils.id,
		name: z.string().nullable(),
		abbr: z.string().nullable(),
		type: EventSchema.shape.type,
	}).strict(),
	school: utils.id.nullable(),
	Students: z.array(z.object({
		id: utils.id,
		first: z.string().nullable(),
		last: z.string().nullable(),
	}).strict()).meta({ description: "The entry's other students, not the person" }),
	Prefs: z.object({
		type: z.string().nullable().meta({ description: 'The pref sheet type' }),
		start: z.iso.datetime().nullable(),
		end: z.iso.datetime().nullable(),
	}).strict().nullable().meta({ description: 'The judge pref window for the category, if it has one' }),
	Rounds: z.array(HomeRoundSchema).meta({ description: 'Rounds at running and just-finished tournaments' }),
}).strict().meta({
	id: 'HomeEntry',
	description: "One of the person's entries at a tournament",
}) satisfies ZodOpenApiSchemaObject;

export type HomeEntry = z.infer<typeof HomeEntrySchema>;

export const HomePrefSheetSchema = z.object({
	category: utils.id,
	Category: z.object({
		name: z.string().nullable(),
		abbr: z.string().nullable(),
	}).strict(),
	start: z.iso.datetime().nullable(),
	end: z.iso.datetime().nullable(),
	entries: z.int().meta({ description: "The school's entries in the category" }),
}).strict().meta({
	id: 'HomePrefSheet',
	description: 'A category with a judge pref window the school has entries in',
}) satisfies ZodOpenApiSchemaObject;

export type HomePrefSheet = z.infer<typeof HomePrefSheetSchema>;

const homeSchoolBase = {
	id: utils.id,
	name: z.string(),
	chapter: utils.id.nullable(),
	Prefs: z.array(HomePrefSheetSchema),
};

export const HomePrefsSchoolSchema = z.object({
	...homeSchoolBase,
	access: z.literal('prefs').meta({ description: 'The person may only fill pref sheets for this school' }),
}).strict().meta({
	id: 'HomePrefsSchool',
	description: 'A school the person holds a prefs-only permission for',
}) satisfies ZodOpenApiSchemaObject;

export const HomeFullSchoolSchema = z.object({
	...homeSchoolBase,
	access: z.literal('full').meta({ description: 'The person coaches this school' }),
	onsite: z.int().meta({ description: 'Whether the school has confirmed its registration onsite' }),
	Counts: z.object({
		entries: z.int(),
		events: z.int(),
		judges: z.int(),
	}).strict(),
	Signups: z.array(z.object({
		entry: utils.id,
		Student: z.object({
			first: z.string().nullable(),
			last: z.string().nullable(),
		}).strict(),
		Event: z.object({
			abbr: z.string().nullable(),
		}).strict(),
	}).strict()).meta({ description: 'Student signups awaiting coach approval' }),
	Onsite: z.object({
		start: z.iso.datetime().nullable(),
		end: z.iso.datetime().nullable(),
	}).strict().nullable().meta({ description: 'The onsite confirmation window, when the tournament uses one' }),
	StrikeCards: z.array(z.object({
		round: utils.id,
		Round: z.object({
			name: RoundSchema.shape.name,
			label: RoundSchema.shape.label,
		}).strict(),
		due: z.iso.datetime().nullable(),
	}).strict()).meta({ description: 'Rounds with a strike card open for one of the school\'s entries' }),
	Flips: z.object({
		open: z.int(),
		deadline: z.iso.datetime().nullable().meta({ description: 'The earliest deadline among them' }),
	}).strict().meta({ description: "Coin flips open to the school's entries" }),
	Fines: z.array(FineSchema).meta({ description: "Judge fines billed to the school for its judges' missed rounds and revoked bonds; school fees are not included" }),
}).strict().meta({
	id: 'HomeFullSchool',
	description: 'A school the person coaches',
}) satisfies ZodOpenApiSchemaObject;

export const HomeSchoolSchema = z.discriminatedUnion('access', [
	HomeFullSchoolSchema,
	HomePrefsSchoolSchema,
]).meta({
	id: 'HomeSchool',
	description: 'A school the person has a permission for at a tournament',
}) satisfies ZodOpenApiSchemaObject;

export type HomeSchool = z.infer<typeof HomeSchoolSchema>;

export const HomeTabSchema = z.object({
	tag: z.string().nullable().meta({ description: 'The permission tag, e.g. owner or tabber' }),
	details: z.string().nullable().meta({ description: 'The permission details, set for limited access' }),
	Counts: z.object({
		schools: z.int(),
		entries: z.int(),
	}).strict(),
	resultsPublished: z.boolean().meta({ description: 'Whether any result set is published' }),
}).strict().meta({
	id: 'HomeTab',
	description: "The person's tab staff permission at a tournament",
}) satisfies ZodOpenApiSchemaObject;

export type HomeTab = z.infer<typeof HomeTabSchema>;

export const HomeTournSchema = z.object({
	id: TournSchema.shape.id,
	name: TournSchema.shape.name,
	city: TournSchema.shape.city,
	state: TournSchema.shape.state,
	country: TournSchema.shape.country,
	tz: TournSchema.shape.tz,
	webname: TournSchema.shape.webname,
	start: TournSchema.shape.start,
	end: TournSchema.shape.end,
	reg_start: TournSchema.shape.reg_start,
	reg_end: TournSchema.shape.reg_end,
	online: z.boolean().meta({ description: 'Whether any event at the tournament runs online' }),
	roles: z.array(HomeRoleSchema).meta({ description: 'The roles the person holds at the tournament' }),
	LiveDocs: z.array(HomeLiveDocSchema),
	TournRooms: z.array(TournRoomSchema).meta({ description: 'Rooms the person may enter; only while the tournament is online and running' }),
	Judges: z.array(HomeJudgeSchema).meta({ description: "The person's judge rows; empty unless they judge here" }),
	Entries: z.array(HomeEntrySchema).meta({ description: "The person's entries; empty unless they compete here" }),
	Schools: z.array(HomeSchoolSchema).meta({ description: 'Schools the person has a permission for; empty unless they coach here' }),
	Tab: HomeTabSchema.nullable().meta({ description: 'Null unless the person is tab staff here' }),
}).strict().meta({
	id: 'HomeTourn',
	description: 'One tournament card on the user home page',
}) satisfies ZodOpenApiSchemaObject;

export type HomeTourn = z.infer<typeof HomeTournSchema>;

export const HomeResponseSchema = z.object({
	now: z.iso.datetime().meta({ description: 'The server time the response was built at' }),
	Alerts: HomeAlertsSchema,
	Tourns: z.array(HomeTournSchema).meta({ description: 'Tournaments running, upcoming, or ended within the last 7 days, sorted by start then name' }),
}).strict().meta({
	id: 'HomeResponse',
	description: 'Everything the user home page shows',
}) satisfies ZodOpenApiSchemaObject;

export type HomeResponse = z.infer<typeof HomeResponseSchema>;
