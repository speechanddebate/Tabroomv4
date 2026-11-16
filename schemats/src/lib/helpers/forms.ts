import type { Problem } from '@tabroom/types';

/**
 * Maps a Problem's issues to `{ field: message }` for each form Field, keyed by the issue's
 * path joined with dots (`address.zip`). The first issue on a field wins; issues without a
 * path belong to the whole form and are left to FormProblem.
 */
export function fieldErrors(problem: Problem | null | undefined): Record<string, string> {
	const errors: Record<string, string> = {};

	for (const issue of problem?.issues ?? []) {
		const field = issue.path.join('.');
		if (field && !(field in errors)) {
			errors[field] = issue.message;
		}
	}

	return errors;
}
