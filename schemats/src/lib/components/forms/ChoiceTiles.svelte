<script lang="ts" module>
	export type ChoiceTile = { value: string, label: string, description?: string };
</script>

<script lang="ts">
	// One choice from two to four, as big tap targets (a ballot's winner). Longer lists use Select.
	type Props = {
		label        : string,
		options      : ChoiceTile[],
		value?       : string,
		description? : string,
		error?       : string,
		required?    : boolean,
		disabled?    : boolean,
		class?       : string,
	};

	let {
		label,
		options,
		value    = $bindable(''),
		description,
		error,
		required = false,
		disabled = false,
		class: classOverride,
	}: Props = $props();

	const id = $props.id();
</script>

<fieldset
	class={['flex min-w-0 flex-col gap-1', classOverride]}
	aria-describedby={[description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}
	{disabled}
>
	<legend class="mb-1 text-sm font-semibold text-text">
		{label}
		{#if required}
			<span class="text-danger" aria-hidden="true">*</span>
		{/if}
	</legend>
	{#if description}
		<span id="{id}-description" class="text-xs text-muted">{description}</span>
	{/if}
	<div class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
		{#each options as option (option.value)}
			<label
				class={[
					'flex cursor-pointer flex-col rounded border-2 bg-surface px-3 py-2 text-sm text-text',
					'has-checked:border-primary-strong has-checked:bg-primary-soft',
					'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary-strong',
					'has-disabled:cursor-not-allowed has-disabled:opacity-50',
					error ? 'border-danger' : 'border-border-strong hover:border-text',
				]}
			>
				<input
					class="sr-only"
					aria-describedby={option.description ? `${id}-${option.value}-description` : undefined}
					aria-labelledby="{id}-{option.value}-label"
					name={id}
					{required}
					type="radio"
					value={option.value}
					bind:group={value}
				/>
				<span id="{id}-{option.value}-label" class="font-semibold">{option.label}</span>
				{#if option.description}
					<span id="{id}-{option.value}-description" class="text-xs text-muted">{option.description}</span>
				{/if}
			</label>
		{/each}
	</div>
	{#if error}
		<span id="{id}-error" class="text-xs font-semibold text-danger">{error}</span>
	{/if}
</fieldset>
