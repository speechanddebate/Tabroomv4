import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';
import * as utils from './utils.js';
import { ChapterSchema } from './Chapter.js';
import { PersonSchema } from './Person.js';

/** A standing conflict: a person who must not judge, or be judged by, another person or a chapter's entries at any tournament */
export const ConflictSchema = z.object({
	id: utils.id,
	person: utils.id,
	conflicted: utils.id.nullable(),
	chapter: utils.id.nullable(),
	added_by: utils.id.nullable(),
	created_at: z.iso.datetime().nullable(),
}).strict().meta({
	id: 'Conflict',
}) satisfies ZodOpenApiSchemaObject;

export type Conflict = z.infer<typeof ConflictSchema>;

/** A standing conflict with whom it names */
export const StandingConflictSchema = ConflictSchema.extend({
	Person: z.object({
		id: PersonSchema.shape.id,
		first: z.string().nullable(),
		last: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The person conflicted, for a person conflict' }),
	Chapter: z.object({
		id: ChapterSchema.shape.id,
		name: ChapterSchema.shape.name,
		state: z.string().nullable(),
	}).strict().nullable().meta({ description: 'The chapter conflicted, for a chapter conflict' }),
}).strict().meta({
	id: 'StandingConflict',
}) satisfies ZodOpenApiSchemaObject;

export type StandingConflict = z.infer<typeof StandingConflictSchema>;

/** A person or a chapter to add as a standing conflict */
export const StandingConflictRequestSchema = z.object({
	person: utils.id.optional(),
	chapter: utils.id.optional(),
}).strict().refine((request) => (request.person === undefined) !== (request.chapter === undefined), {
	message: 'Give a person or a chapter, not both',
}).meta({
	id: 'StandingConflictRequest',
}) satisfies ZodOpenApiSchemaObject;

export type StandingConflictRequest = z.infer<typeof StandingConflictRequestSchema>;

export const StandingConflictRefusalSchema = z.enum(['duplicate', 'self']).meta({
	id: 'StandingConflictRefusal',
	description: 'duplicate: already a standing conflict; self: the person themselves',
}) satisfies ZodOpenApiSchemaObject;

export type StandingConflictRefusal = z.infer<typeof StandingConflictRefusalSchema>;

/** A person found for a standing conflict, with the chapters they have judged or competed for */
export const ConflictPersonMatchSchema = z.object({
	id: PersonSchema.shape.id,
	first: z.string().nullable(),
	last: z.string().nullable(),
	Chapters: z.array(z.object({
		id: ChapterSchema.shape.id,
		name: ChapterSchema.shape.name,
	}).strict()).meta({ description: 'Chapters the person has judged or competed for' }),
}).strict().meta({
	id: 'ConflictPersonMatch',
}) satisfies ZodOpenApiSchemaObject;

export type ConflictPersonMatch = z.infer<typeof ConflictPersonMatchSchema>;

export const ConflictChapterMatchSchema = z.object({
	id: ChapterSchema.shape.id,
	name: ChapterSchema.shape.name,
	city: z.string().nullable(),
	state: z.string().nullable(),
}).strict().meta({
	id: 'ConflictChapterMatch',
}) satisfies ZodOpenApiSchemaObject;

export type ConflictChapterMatch = z.infer<typeof ConflictChapterMatchSchema>;
