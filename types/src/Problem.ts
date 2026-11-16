import type { ZodOpenApiSchemaObject } from 'zod-openapi';
import { z } from 'zod';

// Loose because ValidateRequest sends zod's issues whole, and each zod issue code carries its own extra keys
export const ProblemIssueSchema = z.looseObject({
	path: z.array(z.union([z.string(), z.number()])).meta({ description: 'The request field the issue is about, as a path of keys. Empty for the whole request.' }),
	message: z.string().meta({ description: 'Human-readable explanation of the issue.' }),
	code: z.string().meta({ description: 'The kind of issue, such as a zod issue code or custom.' }),
}).meta({ id: 'ProblemIssue' }) satisfies ZodOpenApiSchemaObject;
export type ProblemIssue = z.infer<typeof ProblemIssueSchema>;

export const ProblemSchema = z.object({
	type: z.url().meta({ description: 'A URI reference that identifies the problem type.' }),
	title: z.string().meta({ description: 'A short, human-readable summary of the problem type.' }),
	status: z.number().int().meta({ description: 'The HTTP status code.' }),
	detail: z.string().optional().meta({ description: 'Human-readable explanation of the error.' }),
	instance: z.string().optional().meta({ description: 'A URI reference to the specific occurrence.' }),
	issues: z.array(ProblemIssueSchema).optional().meta({ description: 'The rules the request broke, one entry per failure, each tied to a field when it has one.' }),
}) satisfies ZodOpenApiSchemaObject;

export type Problem = z.infer<typeof ProblemSchema>;
