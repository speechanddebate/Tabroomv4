<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { createUserJudgesHistoryTourn } from '$indexcards';
	import { handleOrval } from '$lib/helpers/query';
	import JudgeTournHistory from './JudgeTournHistory.svelte';

	const tournId = $derived(Number(page.params.tournId));

	const historyQuery = createUserJudgesHistoryTourn(
		() => tournId,
		() => ({
			query: {
				enabled: Number.isInteger(tournId) && tournId > 0,
			},
		}),
	);

	// Not having judged a tournament is shown in place, not as an error toast
	const notFound = $derived(historyQuery.data?.status === 404);
	const history = $derived(handleOrval(historyQuery, {
		Problem: (problem, defaultHandler) => {
			if (problem.status !== 404) defaultHandler(problem);
		},
	}));
</script>

<svelte:head>
	<title>Judging History{history ? ` - ${history.Tourn.name}` : ''}</title>
</svelte:head>

<a
	class="mb-4 inline-block text-sm font-semibold text-primary-strong hover:text-primary-deep"
	href={resolve('/user/judge/history')}
>&larr; Judging History</a>

{#key tournId}
	<JudgeTournHistory data={history} isLoading={historyQuery.isLoading} {notFound} />
{/key}
