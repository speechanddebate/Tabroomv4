import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';
import * as utils from './utils.js';
import { EntrySchema } from './Entry.js';
import { EventSchema } from './Event.js';
import { JudgeSchema } from './Judge.js';
import { RegionSchema } from './Region.js';
import { StudentSchema } from './Student.js';
import { TournSchema } from './Tourn.js';

const SchoolRef = z.object({
	id: utils.id,
	name: z.string().nullable(),
}).strict();

const RegionRef = RegionSchema.pick({ id: true, name: true }).strict();

/** A conflict on a judge's sheet at one tournament: a strike row the judge may see */
export const JudgeConflictSchema = z.object({
	id: utils.id,
	type: z.enum(['entry', 'school', 'region']).meta({ description: 'Whom the judge cannot judge: one entry, every entry of a school, or every school of a region' }),
	entry: EntrySchema.shape.id.nullable(),
	Entry: EntrySchema.pick({ id: true, code: true, name: true }).extend({
		Event: EventSchema.pick({ abbr: true }).strict(),
	}).strict().nullable(),
	school: utils.id.nullable(),
	School: SchoolRef.nullable(),
	region: RegionSchema.shape.id.nullable(),
	Region: RegionRef.nullable(),
	EnteredBy: z.object({
		first: z.string().nullable(),
		last: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The person who recorded it; null when classic wrote the row without one' }),
	removable: z.boolean().meta({ description: 'Whether the caller may remove it: rows they entered, and rows declared from the judge\'s side' }),
}).strict().meta({
	id: 'JudgeConflict',
}) satisfies ZodOpenApiSchemaObject;

export type JudgeConflict = z.infer<typeof JudgeConflictSchema>;

/** What a judge asks to mark as a conflict */
export const JudgeConflictRequestSchema = z.object({
	type: JudgeConflictSchema.shape.type,
	id: utils.id.meta({ description: 'The entry, school, or region, by type' }),
}).strict().meta({
	id: 'JudgeConflictRequest',
}) satisfies ZodOpenApiSchemaObject;

export type JudgeConflictRequest = z.infer<typeof JudgeConflictRequestSchema>;

/** Why a conflict was not added: the category is closed to judge conflicts, or the target is already covered */
export const ConflictRefusalSchema = z.enum(['closed', 'duplicate', 'school', 'ownSchool']).meta({
	id: 'ConflictRefusal',
	description: 'closed: the category does not take conflicts from judges; duplicate: already marked; school: covered by a conflict with its school; ownSchool: the judge\'s own school',
}) satisfies ZodOpenApiSchemaObject;

export type ConflictRefusal = z.infer<typeof ConflictRefusalSchema>;

/** An entry in the judge's categories, and whether the judge may still mark it as a conflict */
export const ConflictCandidateSchema = z.object({
	id: EntrySchema.shape.id,
	code: EntrySchema.shape.code,
	name: EntrySchema.shape.name,
	event: EntrySchema.shape.event,
	Event: z.object({
		id: utils.id,
		name: z.string().nullable(),
		abbr: z.string().nullable(),
	}).strict(),
	category: utils.id,
	school: EntrySchema.shape.school,
	School: SchoolRef.nullable(),
	Students: z.array(StudentSchema.pick({ id: true, first: true, last: true }).strict()),
	state: z.enum(['open', 'entry', 'school', 'ownSchool']).meta({ description: "open: the judge may mark it; entry: already marked; school: covered by a conflict with its school; ownSchool: the judge's own school, never a candidate" }),
}).strict().meta({
	id: 'ConflictCandidate',
}) satisfies ZodOpenApiSchemaObject;

export type ConflictCandidate = z.infer<typeof ConflictCandidateSchema>;

/** A judge's conflict sheet at one tournament */
export const JudgeConflictsSchema = z.object({
	Judge: z.object({
		id: JudgeSchema.shape.id,
		code: JudgeSchema.shape.code,
		first: JudgeSchema.shape.first,
		last: JudgeSchema.shape.last,
		school: utils.id.nullable(),
		School: SchoolRef.nullable().meta({ description: 'The school that entered the judge; null for a tournament hire' }),
	}).strict(),
	Tourn: z.object({
		id: TournSchema.shape.id,
		name: TournSchema.shape.name,
		tz: TournSchema.shape.tz,
		mockTrial: z.boolean().meta({ description: 'Whether the tournament registers mock trial teams, whose judges conflict by region rather than entry' }),
	}).strict(),
	editable: z.boolean().meta({ description: "Whether the judge's category takes conflicts from its judges; when false there are no candidates" }),
	Strikes: z.array(JudgeConflictSchema),
	Candidates: z.object({
		Entries: z.array(ConflictCandidateSchema).meta({ description: "Every active entry in the judge's category; empty at a mock trial tournament" }),
		Regions: z.array(RegionRef).meta({ description: "The tournament's regions the judge has not marked; only at a mock trial tournament" }),
	}).strict(),
}).strict().meta({
	id: 'JudgeConflicts',
}) satisfies ZodOpenApiSchemaObject;

export type JudgeConflicts = z.infer<typeof JudgeConflictsSchema>;
