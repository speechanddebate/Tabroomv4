<script lang="ts">
	/*
	 * A person's standing conflicts: the people and programs they must never judge or be judged
	 * by. Saving one marks the conflicts it implies at every tournament of theirs that hasn't
	 * ended, and removing one takes those marks back; the server does both.
	 */
	import type { ConflictChapterMatch, ConflictPersonMatch, StandingConflict, StandingConflictRequest } from '@tabroom/types';
	import { renderSnippet } from '@tanstack/svelte-table';
	import Button from '$lib/components/Button.svelte';
	import Table from '$lib/components/utils/Table.svelte';
	import { createAppColumnHelper } from '$lib/components/utils/table.hook';
	import { handleMutation, handleOrval } from '$lib/helpers/query';
	import { personName } from '$lib/helpers/text';
	import { toast } from '$lib/helpers/toasts';
	import { createUserConflictAdd, createUserConflictRemove, createUserConflicts, createUserConflictsChapters, createUserConflictsPeople } from '$indexcards';
	import { conflictName, judgedFor } from './standing';

	const listQuery = createUserConflicts();
	const conflicts = $derived(handleOrval(listQuery) ?? []);
	const add = createUserConflictAdd();
	const remove = createUserConflictRemove();
	let busy = $state(false);

	// the inputs hold what's typed; a search runs on what was submitted
	let first = $state('');
	let last = $state('');
	let email = $state('');
	let peopleTerms = $state<{ first?: string; last?: string; email?: string } | null>(null);
	const peopleQuery = createUserConflictsPeople(() => peopleTerms ?? {}, () => ({ query: { enabled: peopleTerms !== null } }));
	const people = $derived(peopleTerms === null ? [] : handleOrval(peopleQuery) ?? []);

	let chapterName = $state('');
	let chapterTerm = $state<string | null>(null);
	const chaptersQuery = createUserConflictsChapters(() => ({ name: chapterTerm ?? '' }), () => ({ query: { enabled: chapterTerm !== null } }));
	const chapters = $derived(chapterTerm === null ? [] : handleOrval(chaptersQuery) ?? []);

	const conflictedPeople = $derived(new Set(conflicts.map((conflict) => conflict.conflicted)));
	const conflictedChapters = $derived(new Set(conflicts.map((conflict) => conflict.chapter)));

	function searchPeople(event: SubmitEvent) {
		event.preventDefault();
		const terms = { first: first.trim() || undefined, last: last.trim() || undefined, email: email.trim() || undefined };
		if (!terms.last && !terms.email) {
			toast.warning({ message: 'Give a last name or an email', detail: 'A first name alone finds too many people' });
			return;
		}
		// the same terms keep the same query key, so a repeat search has to refetch by hand
		if (terms.first === peopleTerms?.first && terms.last === peopleTerms?.last && terms.email === peopleTerms?.email) void peopleQuery.refetch();
		peopleTerms = terms;
	}

	function searchChapters(event: SubmitEvent) {
		event.preventDefault();
		if (chapterName.trim().length < 2) {
			toast.warning({ message: 'Give at least two letters of the program name' });
			return;
		}
		if (chapterTerm === chapterName.trim()) void chaptersQuery.refetch();
		chapterTerm = chapterName.trim();
	}

	async function mark(request: StandingConflictRequest, label: string) {
		busy = true;
		const added = await handleMutation(() => add.mutateAsync({ data: request }));
		if (added) toast.success({ message: `${label} added to your standing conflicts` });
		await listQuery.refetch();
		busy = false;
	}

	// a 204 has no body to test, so a refusal is noticed through the problem handler
	async function unmark(conflict: StandingConflict) {
		busy = true;
		let refused = false;
		await handleMutation(() => remove.mutateAsync({ conflictId: conflict.id }), {
			Problem: (problem, callDefault) => { refused = true; callDefault(problem); },
		});
		if (!refused) toast.success({ message: `${conflictName(conflict)} removed from your standing conflicts` });
		await listQuery.refetch();
		busy = false;
	}

	const listHelper = createAppColumnHelper<StandingConflict>();
	const listColumns = listHelper.columns([
		listHelper.accessor(conflictName, { id: 'name', header: 'Conflict' }),
		listHelper.accessor((conflict) => conflict.Chapter ? 'Program' : 'Person', { id: 'kind', header: 'Kind', size: 100 }),
		listHelper.display({ id: 'remove', header: '', cell: ({ row }) => renderSnippet(removeCell, row.original), size: 120 }),
	]);

	const peopleHelper = createAppColumnHelper<ConflictPersonMatch>();
	const peopleColumns = peopleHelper.columns([
		peopleHelper.accessor(personName, { id: 'name', header: 'Name' }),
		peopleHelper.accessor(judgedFor, { id: 'judgedFor', header: 'Has judged for' }),
		peopleHelper.display({ id: 'add', header: '', cell: ({ row }) => renderSnippet(personCell, row.original), size: 120 }),
	]);

	const chapterHelper = createAppColumnHelper<ConflictChapterMatch>();
	const chapterColumns = chapterHelper.columns([
		chapterHelper.accessor('name', { id: 'name', header: 'Program' }),
		chapterHelper.accessor((chapter) => [chapter.city, chapter.state].filter(Boolean).join(', '), { id: 'where', header: 'Location' }),
		chapterHelper.display({ id: 'add', header: '', cell: ({ row }) => renderSnippet(chapterCell, row.original), size: 120 }),
	]);

	const heading = 'text-base font-semibold text-text';
	const field = 'w-full rounded-md border border-border-strong px-3 py-2 text-sm';
	const label = 'block text-xs font-semibold text-muted';
</script>

{#snippet removeCell(conflict: StandingConflict)}
	<Button color="danger" disabled={busy} onclick={() => unmark(conflict)} size="sm" variant="outline">Remove</Button>
{/snippet}

{#snippet personCell(match: ConflictPersonMatch)}
	{#if conflictedPeople.has(match.id)}
		<span class="text-xs text-muted">Already a conflict</span>
	{:else}
		<Button color="danger" disabled={busy} onclick={() => mark({ person: match.id }, personName(match))} size="sm">Conflict</Button>
	{/if}
{/snippet}

{#snippet chapterCell(chapter: ConflictChapterMatch)}
	{#if conflictedChapters.has(chapter.id)}
		<span class="text-xs text-muted">Already a conflict</span>
	{:else}
		<Button color="danger" disabled={busy} onclick={() => mark({ chapter: chapter.id }, chapter.name)} size="sm">Conflict</Button>
	{/if}
{/snippet}

<h2>Standing conflicts</h2>
<p class="mt-1 text-sm text-muted">
	People and programs you have a coaching or personal relationship with, so you should never judge them or be judged by them.
	Tabroom marks them at every tournament you attend; a tournament's tab staff still decides who judges whom.
</p>

<section class="mt-4">
	<h3 class="{heading} mb-1">Your standing conflicts</h3>
	<Table
		caption="Your standing conflicts"
		columns={listColumns}
		data={conflicts}
		emptyMessage="None yet."
		enableSorting={false}
		getRowId={(conflict) => String(conflict.id)}
	/>
</section>

<section class="mt-6">
	<h3 class="{heading} mb-1">Add a person</h3>
	<form class="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" onsubmit={searchPeople}>
		<label>
			<span class={label}>Last name</span>
			<input name="last" class={field} autocomplete="off" type="text" bind:value={last} />
		</label>
		<label>
			<span class={label}>First name</span>
			<input name="first" class={field} autocomplete="off" type="text" bind:value={first} />
		</label>
		<label>
			<span class={label}>Email</span>
			<input name="email" class={field} autocomplete="off" type="email" bind:value={email} />
		</label>
		<Button class="sm:self-end" color="primary" type="submit">{peopleQuery.isFetching ? 'Searching…' : 'Search'}</Button>
	</form>
	{#if peopleTerms !== null}
		<div class="mt-3">
			<Table
				caption="People found"
				columns={peopleColumns}
				data={people}
				emptyMessage="No one found. Try the last name alone, or the exact email."
				enableSorting={false}
				getRowId={(match) => String(match.id)}
				isLoading={peopleQuery.isLoading}
			/>
		</div>
	{/if}
</section>

<section class="mt-6">
	<h3 class="{heading} mb-1">Add a program</h3>
	<form class="grid gap-3 sm:grid-cols-[1fr_auto]" onsubmit={searchChapters}>
		<label>
			<span class={label}>Program name</span>
			<input name="chapter" class={field} autocomplete="off" type="text" bind:value={chapterName} />
		</label>
		<Button class="sm:self-end" color="primary" type="submit">{chaptersQuery.isFetching ? 'Searching…' : 'Search'}</Button>
	</form>
	{#if chapterTerm !== null}
		<div class="mt-3">
			<Table
				caption="Programs found"
				columns={chapterColumns}
				data={chapters}
				emptyMessage="No program starts with that."
				enableSorting={false}
				getRowId={(chapter) => String(chapter.id)}
				isLoading={chaptersQuery.isLoading}
			/>
		</div>
	{/if}
</section>
