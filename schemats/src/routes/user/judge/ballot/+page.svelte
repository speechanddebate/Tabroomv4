<script lang='ts'>
	import type { BallotContext } from '@tabroom/types';
	import { CLASSIC_URL } from '$app/env/public';
	import { createRestJudgesBallotContext } from '$indexcards';
	import { handleOrval } from '$lib/helpers/query';
	import Loading from '$lib/layouts/Loading.svelte';
	import BallotLayout from './BallotLayout.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	// Not persisted: a reload restoring it would show the ballot as it was, e.g. unconfirmed
	const contextQuery = createRestJudgesBallotContext(() => data.judgeId, () => data.panelId, () => ({
		query: { meta: { persist: false } },
	}));
	// The components take the shared type. Orval types the empty placeholder blocks (ranks: {},
	// points.rubric: {}) as open objects while zod makes them closed; the same once they get fields
	const context = $derived(handleOrval(contextQuery) as BallotContext | null);

	const classicUrl = $derived(`${CLASSIC_URL}/user/judge/ballot.mhtml?panel_id=${data.panelId}&judge_id=${data.judgeId}`);
</script>

{#snippet classicLink(text: string)}
	<a class='font-semibold underline hover:text-warning' href={classicUrl}>{text}</a>
{/snippet}

{#if contextQuery.isPending}
	<Loading />
{:else if !context}
	<!-- handleOrval has already shown the problem -->
	<div class='rounded-md border border-danger bg-danger-soft p-4'>
		<h2 class='text-lg font-semibold text-text'>This ballot couldn't be loaded</h2>
		<p class='mt-2 text-sm text-text'>You can still {@render classicLink('enter it on classic Tabroom')}.</p>
	</div>
{:else if context.eventType === 'other'}
	<div class='rounded-md border border-warning bg-warning-soft p-4'>
		<h2 class='text-lg font-semibold text-text'>This ballot uses features that are unsupported on the beta</h2>
		<p class='mt-2 text-sm text-text'>Please {@render classicLink('enter it on classic Tabroom')}.</p>
	</div>
{:else}
	<BallotLayout {context} judgeId={data.judgeId} panelId={data.panelId} />
{/if}
