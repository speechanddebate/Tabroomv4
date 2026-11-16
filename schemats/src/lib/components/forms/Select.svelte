<script lang="ts" module>
	export type SelectOption = { value: string, label: string };
	export type SelectGroup = { label: string, options: SelectOption[] };
</script>

<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import Field, { controlBox, controlHeights, type ControlSize } from './Field.svelte';

	type Props = {
		label        : string,
		options      : SelectOption[] | SelectGroup[],
		value?       : string,
		size?        : ControlSize,
		description? : string,
		error?       : string,
		required?    : boolean,
		hideLabel?   : boolean,
		class?       : string,
	} & Omit<HTMLSelectAttributes, 'class' | 'value' | 'size' | 'multiple' | 'id' | 'aria-describedby' | 'aria-invalid'>;

	let {
		label,
		options,
		value    = $bindable(''),
		size     = 'md',
		description,
		error,
		required = false,
		hideLabel,
		class: classOverride,
		...rest
	}: Props = $props();

	const isGroup = (option: SelectOption | SelectGroup): option is SelectGroup => 'options' in option;

	// A stored value the list no longer offers (a legacy state or time zone) stays selected
	// rather than silently switching to the first option
	let missingValue = $derived(
		options.flatMap(option => isGroup(option) ? option.options : [option]).some(option => option.value === value)
			? undefined
			: value,
	);
</script>

<Field class={classOverride} {description} {error} {hideLabel} {label} {required}>
	{#snippet children(control)}
		<!-- Right padding leaves room for the forms plugin's arrow; its 8px vertical padding clips text at sm, and the fixed height centers it anyway -->
		<select
			class={['w-full py-0', controlBox, controlHeights[size], size === 'md' ? 'pr-9 pl-3' : 'pr-7 pl-2']}
			{required}
			bind:value
			{...control}
			{...rest}
		>
			{#if missingValue !== undefined}
				<option value={missingValue}>{missingValue}</option>
			{/if}
			{#each options as option (isGroup(option) ? option.label : option.value)}
				{#if isGroup(option)}
					<optgroup label={option.label}>
						{#each option.options as groupOption (groupOption.value)}
							<option value={groupOption.value}>{groupOption.label}</option>
						{/each}
					</optgroup>
				{:else}
					<option value={option.value}>{option.label}</option>
				{/if}
			{/each}
		</select>
	{/snippet}
</Field>
