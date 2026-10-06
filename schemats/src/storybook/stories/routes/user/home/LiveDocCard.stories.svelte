<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { FileText } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';

	// Temporary: compares options for the Live Doc card in routes/user/home/Tournament.svelte.
	// Delete once one is chosen.
	const { Story } = defineMeta({
		title: 'Routes/User/Home/Live Doc Card (options)',
	});

	const livedoc = { url: '#live-doc', caption: 'Round 3 Live Doc' };
	const cardClass = 'relative shadow-sm border border-primary-strong rounded-lg px-2 py-2 m-2 w-72';
</script>

<Story name="Current: button does nothing">
	<div class={cardClass}>
		<div class="flex justify-center">
			<a class="font-semibold text-center" href={livedoc.url}>{livedoc.caption}</a>
		</div>
		<div class="absolute right-2 top-1/2 -translate-y-1/2">
			<Button color="primary" label="Live Doc" variant="outline"><FileText size="20" /></Button>
		</div>
	</div>
</Story>

<Story name="A: Icon button links to the doc">
	<div class={cardClass}>
		<div class="flex justify-center">
			<a class="font-semibold text-center" href={livedoc.url}>{livedoc.caption}</a>
		</div>
		<div class="absolute right-2 top-1/2 -translate-y-1/2">
			<Button color="primary" href={livedoc.url} label="Open {livedoc.caption}" variant="outline"><FileText size="20" /></Button>
		</div>
	</div>
</Story>

<Story name="B: Text link only">
	<div class={cardClass}>
		<div class="flex justify-center">
			<a class="font-semibold text-center" href={livedoc.url}>{livedoc.caption}</a>
		</div>
	</div>
</Story>

<Story name="C: Decorative icon">
	<div class={cardClass}>
		<div class="flex justify-center">
			<a class="font-semibold text-center" href={livedoc.url}>{livedoc.caption}</a>
		</div>
		<div class="absolute right-3 top-1/2 -translate-y-1/2 text-primary-strong" aria-hidden="true">
			<FileText size="20" />
		</div>
	</div>
</Story>

<Story name="D: Whole card is one link">
	<a class="{cardClass} flex items-center justify-between gap-2 hover:bg-primary-soft" href={livedoc.url}>
		<span class="grow text-center font-semibold text-primary-strong">{livedoc.caption}</span>
		<FileText aria-hidden="true" class="text-primary-strong" size="20" />
	</a>
</Story>
