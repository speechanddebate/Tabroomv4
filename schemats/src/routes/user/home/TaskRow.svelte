<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import OnlineRoom from '$lib/components/OnlineRoom.svelte';
	import ItemList from './ItemList.svelte';
	import type { Task } from './tasks';

	const { task }: { task: Task } = $props();

	// The yellow bar is the one "do this now" signal on the page.
	const tones = {
		now     : 'border-accent bg-accent-soft',
		due     : 'border-primary-strong bg-surface',
		info    : 'border-border bg-surface',
		problem : 'border-danger bg-danger-soft',
	};
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-4 px-3 py-2 {tones[task.tone]}">
	<div class="min-w-0 flex-1 basis-56">
		<div class="font-semibold">{task.title}</div>
		{#if task.when || task.detail}
			<div class="mt-0.5 text-sm text-muted">
				{#if task.when}<span class="font-semibold text-text">{task.when}{task.detail && !task.when.endsWith('.') ? '.' : ''}</span>{/if}
				{task.detail ?? ''}
			</div>
		{/if}
	</div>
	{#if task.action || task.room}
		<div class="flex flex-wrap items-center gap-2">
			{#if task.room}
				<OnlineRoom room={task.room.room} target={task.room.target} variant="text" />
			{/if}
			{#if task.action}
				<Button
					color={task.tone === 'problem' ? 'danger' : 'primary'}
					href={task.action.href}
					size="sm"
					variant={task.tone === 'now' ? 'solid' : 'outline'}
				>{task.action.label}</Button>
			{/if}
		</div>
	{/if}

	<!--
		A group (ten strike cards, nine questionnaires) stays one row; the list is
		behind a disclosure so the action area keeps its height whatever the count.
	-->
	{#if task.items && task.items.length > 0}
		<div class="basis-full">
			<ItemList items={task.items} summary="All {task.items.length} {task.itemsLabel ?? 'items'}" />
		</div>
	{/if}
</div>
