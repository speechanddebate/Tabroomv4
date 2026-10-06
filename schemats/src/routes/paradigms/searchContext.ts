import type { ParadigmSearchResult, ProblemSchema } from '$indexcards/schemas';
import type { CreateInfiniteQueryResult } from '@tanstack/svelte-query';

export type ParadigmsSearchContext = {
	getSearchTerm: () => string;
	getShowResults: () => boolean;
	getResults: () => ParadigmSearchResult[];
	getSelectedHref: () => (id: number) => string;
	paradigmsQuery: CreateInfiniteQueryResult<unknown, ProblemSchema>;
};
