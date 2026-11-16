<script lang="ts">
	import type { Snippet } from 'svelte';

	// A switch saves the moment it changes; inside a form that waits for Save, use Checkbox instead
	type Props = {
		label             : string,
		checked?          : boolean,
		// Saves the new position. Resolving false or throwing puts the switch back and says it wasn't saved.
		save              : (checked: boolean) => Promise<boolean | void>,
		description?      : string,
		disabled?         : boolean,
		// Settings that only apply in one position, shown indented under the switch while it's there
		children?         : Snippet,
		showChildrenWhen? : boolean,
		class?            : string,
	};

	let {
		label,
		checked          = $bindable(false),
		save,
		description,
		disabled         = false,
		children,
		showChildrenWhen = true,
		class: classOverride,
	}: Props = $props();

	const id = $props.id();
	let status: 'idle' | 'saving' | 'saved' | 'failed' = $state('idle');

	const toggle = async () => {
		if (status === 'saving') {
			return;
		}
		const next = !checked;
		checked = next;
		status = 'saving';
		try {
			if (await save(next) === false) {
				throw new Error('Not saved');
			}
			status = 'saved';
		} catch {
			checked = !next;
			status = 'failed';
		}
	};
</script>

<div class={['flex flex-col gap-2', classOverride]}>
	<div class="flex items-start justify-between gap-3">
		<div class="flex flex-col">
			<label id="{id}-label" class="text-sm font-semibold text-text" for={id}>{label}</label>
			{#if description}
				<span id="{id}-description" class="text-xs text-muted">{description}</span>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<span id="{id}-status" class="text-xs" aria-live="polite">
				{#if status === 'saving'}
					<span class="text-muted">Saving</span>
				{:else if status === 'saved'}
					<span class="font-semibold text-success">Saved</span>
				{:else if status === 'failed'}
					<span class="font-semibold text-danger">Not saved</span>
				{/if}
			</span>
			<button
				{id}
				class={[
					'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition motion-reduce:transition-none',
					'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong',
					'disabled:cursor-not-allowed disabled:opacity-50',
					checked ? 'border-primary-strong bg-primary-strong' : 'border-border-strong bg-surface-alt',
				]}
				aria-busy={status === 'saving' || undefined}
				aria-checked={checked}
				aria-describedby={[description && `${id}-description`, `${id}-status`].filter(Boolean).join(' ')}
				aria-labelledby="{id}-label"
				{disabled}
				onclick={toggle}
				role="switch"
				type="button"
			>
				<span
					class={[
						'absolute top-0.5 size-4 rounded-full shadow-sm transition-all motion-reduce:transition-none',
						checked ? 'left-5.5 bg-white' : 'left-0.5 bg-border-strong',
					]}
				></span>
			</button>
		</div>
	</div>
	{#if children && checked === showChildrenWhen}
		<div class="ml-3 border-l-2 border-border pl-3">{@render children()}</div>
	{/if}
</div>
