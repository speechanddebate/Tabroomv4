import z from 'zod';
import logger from '../../helpers/logger.js';
import { fetchNSDA } from './fetchNSDA.js';

/**
 * One person's completion of an NSDA Learn course, under the API's own field names.
 * The Learn site sends person_id as text and user_id as the same id in a number; only
 * person_id is kept, as a number
 */
export const LearnCompletionSchema = z.object({
	/** Their NSDA member id, which is their user id on the Learn site */
	person_id: z.coerce.number().int().positive(),
	email: z.string().trim().min(1),
	/** Their display name on the Learn site */
	name: z.string().nullish(),
	/**
	 * When they finished, as the Learn database wrote it: a date and time with no zone
	 * ("2026-10-02 14:05:11"). Anything that does not read as one, a zero date included, fails
	 */
	completed: z.string().refine((value) => !Number.isNaN(Date.parse(`${value.replace(' ', 'T')}Z`))),
});

export type LearnCompletion = z.infer<typeof LearnCompletionSchema>;

/**
 * Everyone who has completed an NSDA Learn course, every row checked against the schema, so
 * a caller never handles a raw answer. The API hands back every completion the course has
 * ever had, not the new ones. A course nobody has completed is an empty list.
 * Throws when the request fails (NSDAError), and when the answer is not a list: the API
 * passes a Learn site error through as a 200 whose body is an object. A row that fails the
 * schema is left out with a warning; if every row fails, the answer has changed shape and
 * that throws too, so a course is never taken to have no completions when it has thousands
 */
export async function getLearnCompletions(course: number): Promise<LearnCompletion[]> {
	const response = await fetchNSDA(`/learn/courses/${course}`);

	if (!Array.isArray(response)) {
		throw new Error(`NSDA Learn did not return a list of completions for course ${course}`);
	}

	const completions = response.flatMap((row) => {
		const parsed = LearnCompletionSchema.safeParse(row);
		return parsed.success ? [parsed.data] : [];
	});

	const skipped = response.length - completions.length;
	if (response.length && !completions.length) {
		throw new Error(`None of the ${response.length} rows NSDA Learn returned for course ${course} had an id, an email, and a completion date`);
	}
	if (skipped) {
		logger.warn(`Left out ${skipped} of ${response.length} NSDA Learn completions for course ${course} that had no id, email, or completion date`, {
			'event.name': 'nsda.learn.completions.skipped',
			course,
			skipped,
		});
	}
	return completions;
}
