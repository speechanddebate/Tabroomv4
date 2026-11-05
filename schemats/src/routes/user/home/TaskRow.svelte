<script lang="ts">
	import { Clock, ClockAlert, Info, OctagonAlert } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import OnlineRoom from '$lib/components/OnlineRoom.svelte';
	import ItemList from './ItemList.svelte';
	import type { Task } from './tasks';

	const { task }: { task: Task } = $props();

	// Muted text fails contrast on danger-soft, so critical detail stays body color.
	const levels = {
		info     : { Icon: Info, row: 'border-l-border-strong bg-surface-alt', icon: 'text-muted', button: 'default', detail: 'text-muted' },
		due      : { Icon: Clock, row: 'border-l-primary-strong bg-primary-soft', icon: 'text-primary-strong', button: 'primary', detail: 'text-muted' },
		alert    : { Icon: ClockAlert, row: 'border-l-accent bg-accent-soft', icon: 'text-warning', button: 'warning', detail: 'text-muted' },
		critical : { Icon: OctagonAlert, row: 'border-l-danger bg-danger-soft', icon: 'text-danger', button: 'danger', detail: 'text-text' },
	} as const;

	const level = $derived(levels[task.tone]);
</script>

<div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-4 px-3 py-2 {level.row}">
	<level.Icon class="size-5 shrink-0 {level.icon}" aria-hidden="true" />
	<div class="min-w-0 flex-1 basis-56">
		<div class="font-semibold">{task.title}</div>
		{#if task.when || task.detail}
			<div class="mt-0.5 text-sm {level.detail}">
				{#if task.when}<span class="font-semibold text-text">{task.when}{task.detail && !task.when.endsWith('.') ? '.' : ''}</span>{/if}
				{task.detail ?? ''}
			</div>
		{/if}
		{#each task.lines ?? [] as line, idx (idx)}
			<div class="mt-0.5 text-sm {level.detail}">{line}</div>
		{/each}
	</div>
	{#if task.action || task.room}
		<div class="flex flex-wrap items-center gap-2">
			{#if task.room}
				<OnlineRoom room={task.room.room} size="md" target={task.room.target} variant="text" />
			{/if}
			{#if task.action}
				<!-- Everything but info is owed, so only info gets the quieter outline button -->
				<Button
					color={level.button}
					href={task.action.href}
					size="md"
					variant={task.tone === 'info' ? 'outline' : 'solid'}
				>{task.action.label}</Button>
			{/if}
		</div>
	{/if}

	<!--
		A group (ten strike cards, nine questionnaires) stays one row; the list is
		behind a disclosure so the action area keeps its height whatever the count.
		The indent lines it up with the title, past the icon.
	-->
	{#if task.items && task.items.length > 0}
		<div class="basis-full pl-8">
			<ItemList items={task.items} summary="All {task.items.length} {task.itemsLabel ?? 'items'}" />
		</div>
	{/if}
</div>
