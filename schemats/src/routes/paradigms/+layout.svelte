<script lang="ts">
	import { createRestParadigmsInfinite } from '$indexcards';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { setContext } from 'svelte';
	import { Search } from 'flowbite-svelte';
	import Button from '$lib/components/Button.svelte';

	import { handleOrval } from '$lib/helpers/query';
	import WithSidebar from '$lib/layouts/WithSidebar.svelte';
	import ParadigmResultsList from './paradigmResultsList.svelte';
	import type { ParadigmsSearchContext } from './searchContext';
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
	};

	const { children }: Props = $props();

	const LIMIT = 25;

	let query = $state('');
	let searchTerm = $state('');

	const paradigmsQuery = createRestParadigmsInfinite(
		() => ({ search: searchTerm, limit: LIMIT }),
		() => ({
			query: {
				enabled: searchTerm.length > 0,
				getNextPageParam: (lastPage, pages) => {
					const pageData = Array.isArray(lastPage.data) ? lastPage.data : [];
					return pageData.length < LIMIT ? undefined : pages.length * LIMIT;
				},
			},
		})
	);
	const results = $derived(handleOrval(paradigmsQuery) ?? []);

	const showResults = $derived(searchTerm.length > 0 && !paradigmsQuery.isLoading);
	const isDetailPage = $derived.by(() => {
		const personId = Number(page.params.id);
		return Number.isInteger(personId) && personId > 0;
	});

	const selectedHref = $derived.by(() => {
		if (!searchTerm) return (id: number) => `/paradigms/${id}`;
		const search = encodeURIComponent(searchTerm);
		return (id: number) => `/paradigms/${id}?search=${search}`;
	});

	const paradigmsSearchContext: ParadigmsSearchContext = {
		getSearchTerm: () => searchTerm,
		getShowResults: () => showResults,
		getResults: () => results,
		getSelectedHref: () => selectedHref,
		paradigmsQuery,
	};

	setContext('paradigmsSearch', paradigmsSearchContext);

	function updatePathSearch(nextSearch: string) {
		const target = new URL(page.url);
		if (!nextSearch) {
			target.searchParams.delete('search');
		} else {
			target.searchParams.set('search', nextSearch);
		}

		goto(`${target.pathname}${target.search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true,
		});
	}

	function handleSearch() {
		const nextSearch = query.trim();
		updatePathSearch(nextSearch);
	}

	$effect(() => {
		const nextSearch = page.url.searchParams.get('search')?.trim() ?? '';
		if (nextSearch === searchTerm) return;
		searchTerm = nextSearch;
		query = nextSearch;
	});
</script>

{#snippet searchBox()}
	<Search
		id="paradigm-search"
		aria-label="Search paradigms"
		onkeydown={(e) => e.key === 'Enter' && handleSearch()}
		placeholder="ex: Winston Smith"
		type="search"
		bind:value={query}
	>
		<Button
			class="me-1"
			color="primary"
			disabled={paradigmsQuery.isLoading}
			onclick={handleSearch}
			size="sm"
		>
			{paradigmsQuery.isLoading ? 'Searching...' : 'Search'}
		</Button>
	</Search>
{/snippet}

{#if isDetailPage}
	<WithSidebar>
		<h2>Judge Paradigms</h2>
		{@render children()}

		{#snippet sidebar({ closeDrawer })}
			<div class="sidenote">
				{@render searchBox()}
			</div>

			{#if showResults}
				<div class="sidenote mt-3 max-h-[calc(100dvh-14rem)] overflow-y-auto pr-1">
					<ParadigmResultsList
						onselect={closeDrawer}
						paradigmsQuery={paradigmsQuery}
						results={results}
						searchTerm={searchTerm}
						selectedHref={selectedHref}
					/>
				</div>
			{/if}
		{/snippet}
	</WithSidebar>
{:else}
	<h2>Judge Paradigms</h2>
	<div class="mx-auto w-full max-w-5xl">
		<div class="rounded-lg border border-accent bg-surface p-3">
			{@render searchBox()}
		</div>
		<section class="mt-3">
			{@render children()}
		</section>
	</div>
{/if}
