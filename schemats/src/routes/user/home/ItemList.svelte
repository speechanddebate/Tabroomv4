<script lang="ts">
	/*
	 * A disclosure over a list of rows: strike cards, questionnaires. The
	 * summary is the toggle; each row shows where it stands and links to it.
	 * Used in an action row and in a card's tab, so the list looks the same
	 * wherever it appears.
	 */
	import { ChevronRight } from '@lucide/svelte';
	import type { TaskItem } from './tasks';

	type Props = {
		items   : TaskItem[],
		summary : string,
	};

	const { items, summary }: Props = $props();

	const statusTones = {
		success : 'text-success',
		warning : 'text-warning',
		danger  : 'text-danger',
		muted   : 'text-muted',
	};

	const link = 'font-semibold text-primary-strong underline decoration-dotted underline-offset-2 hover:text-primary-deep';
</script>

<details class="group">
	<summary class="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary-strong hover:text-primary-deep focus-visible:outline-2 focus-visible:outline-primary-strong [&::-webkit-details-marker]:hidden">
		<ChevronRight class="transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" size="16" />
		{summary}
	</summary>
	<ul class="mt-1 divide-y divide-border border-t border-border text-sm">
		{#each items as item, idx (idx)}
			<li class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
				<div class="min-w-0">
					<span class="font-semibold">{item.label}</span>
					{#if item.detail}<span class="ml-2 text-muted">{item.detail}</span>{/if}
					{#if item.status}<span class="block text-xs sm:hidden {statusTones[item.status.tone]}">{item.status.text}</span>{/if}
				</div>
				<div class="hidden text-right sm:block">
					{#if item.status}
						<span class="text-xs {statusTones[item.status.tone]}">{item.status.text}</span>
					{:else if item.when}
						<span class="text-muted">{item.when}</span>
					{/if}
				</div>
				<div class="text-right">
					{#if item.action}
						<a class={link} href={item.action.href}>{item.action.label}<span class="sr-only"> {item.label}</span></a>
					{:else if item.when}
						<span class="text-muted sm:hidden">{item.when}</span>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</details>
